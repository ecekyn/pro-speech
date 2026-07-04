package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pro-speech/backend/models"
	"github.com/pro-speech/backend/services"
)

type textSessionRequest struct {
	Transcript      string `json:"transcript"`
	TargetSpeaker   string `json:"target_speaker"`
	Date            string `json:"date"`
	StartedAt       string `json:"started_at"`
	EndedAt         string `json:"ended_at"`
	DurationSeconds int    `json:"duration_seconds"`
}

type sessionMetadata struct {
	Date            string
	StartedAt       string
	EndedAt         string
	DurationSeconds int
	TargetSpeaker   string
}

func AnalyzeAudio(c *gin.Context) {
	report, err := analyzeUploadedAudio(c, c.PostForm("target_speaker"))
	if err != nil {
		writeAnalysisError(c, err)
		return
	}

	c.JSON(http.StatusOK, report)
}

func CreateAudioSession(c *gin.Context) {
	targetSpeaker := c.PostForm("target_speaker")
	report, err := analyzeUploadedAudio(c, targetSpeaker)
	if err != nil {
		writeAnalysisError(c, err)
		return
	}

	durationSeconds, _ := strconv.Atoi(c.PostForm("duration_seconds"))
	metadata := sessionMetadata{
		Date:            c.PostForm("date"),
		StartedAt:       c.PostForm("started_at"),
		EndedAt:         c.PostForm("ended_at"),
		DurationSeconds: durationSeconds,
		TargetSpeaker:   targetSpeaker,
	}

	writeSessionResponse(c, report, metadata)
}

func CreateTextSession(c *gin.Context) {
	var req textSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON body"})
		return
	}
	if strings.TrimSpace(req.Transcript) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "transcript is required"})
		return
	}

	report, err := services.AnalyzeTranscriptWithOptions(req.Transcript, services.AnalysisOptions{
		TargetSpeaker: req.TargetSpeaker,
	})
	if err != nil {
		writeAnalysisError(c, err)
		return
	}

	writeSessionResponse(c, report, sessionMetadata{
		Date:            req.Date,
		StartedAt:       req.StartedAt,
		EndedAt:         req.EndedAt,
		DurationSeconds: req.DurationSeconds,
		TargetSpeaker:   req.TargetSpeaker,
	})
}

func GetTodayReport(c *gin.Context) {
	date := c.Query("date")
	if !isValidDate(date) {
		date = time.Now().Format("2006-01-02")
	}

	writeDailyReport(c, date)
}

func GetDailyReport(c *gin.Context) {
	date := c.Param("date")
	if !isValidDate(date) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date must use YYYY-MM-DD"})
		return
	}

	writeDailyReport(c, date)
}

func GetSessions(c *gin.Context) {
	date := c.Query("date")
	if !isValidDate(date) {
		date = time.Now().Format("2006-01-02")
	}

	store, err := services.DefaultStore()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"sessions": store.SessionsForDate(date)})
}

func analyzeUploadedAudio(c *gin.Context, targetSpeaker string) (*models.AnalysisReport, error) {
	file, header, err := c.Request.FormFile("audio")
	if err != nil {
		return nil, requestError("No audio file provided")
	}
	defer file.Close()

	audioData, err := io.ReadAll(file)
	if err != nil {
		return nil, err
	}

	filename := "recording.m4a"
	if header != nil && header.Filename != "" {
		filename = header.Filename
	}

	transcription, err := services.TranscribeAudio(audioData, filename)
	if err != nil {
		return nil, err
	}

	transcriptForAnalysis := transcription.Transcript
	if transcription.SpeakerTranscript != "" {
		transcriptForAnalysis = transcription.SpeakerTranscript
	}

	var voiceMatch *models.VoiceMatch
	if strings.TrimSpace(targetSpeaker) == "" {
		voiceMatch, err = services.IdentifyUserSpeaker(audioData, filename, transcription)
		if err != nil {
			voiceMatch = &models.VoiceMatch{
				Status: "unavailable",
				Notice: "Voice matching failed, so default speaker selection will be used: " + err.Error(),
			}
		}
		switch voiceMatch.Status {
		case "matched":
			targetSpeaker = voiceMatch.Speaker
		case "no_confident_match", "unavailable":
			return reportWithoutVoiceMatch(transcriptForAnalysis, transcription, voiceMatch), nil
		}
	}

	report, err := services.AnalyzeTranscriptWithOptions(transcriptForAnalysis, services.AnalysisOptions{
		TargetSpeaker:          targetSpeaker,
		Speakers:               transcription.Speakers,
		SpeakerLabelsAvailable: transcription.HasSpeakerLabels,
	})
	if err != nil {
		return nil, err
	}
	report.VoiceMatch = voiceMatch
	report.SpeakerNotice = joinNotices(voiceMatchNotice(voiceMatch), report.SpeakerNotice)

	return report, nil
}

func writeSessionResponse(c *gin.Context, report *models.AnalysisReport, metadata sessionMetadata) {
	store, err := services.DefaultStore()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	session := buildSession(report, metadata)
	if err := store.AddSession(session); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.SessionAnalysisResponse{
		Session:     session,
		DailyReport: store.DailyReport(session.Date, time.Now()),
	})
}

func writeDailyReport(c *gin.Context, date string) {
	store, err := services.DefaultStore()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, store.DailyReport(date, time.Now()))
}

func buildSession(report *models.AnalysisReport, metadata sessionMetadata) models.ConversationSession {
	now := time.Now()
	startedAt := parseClientTime(metadata.StartedAt, now)
	endedAt := parseClientTime(metadata.EndedAt, now)
	if endedAt.Before(startedAt) {
		endedAt = now
	}

	durationSeconds := metadata.DurationSeconds
	if durationSeconds <= 0 {
		durationSeconds = int(endedAt.Sub(startedAt).Seconds())
	}
	if durationSeconds < 0 {
		durationSeconds = 0
	}

	date := metadata.Date
	if !isValidDate(date) {
		date = endedAt.Format("2006-01-02")
	}

	targetSpeaker := report.TargetSpeaker
	if strings.TrimSpace(targetSpeaker) == "" {
		targetSpeaker = metadata.TargetSpeaker
	}

	return models.ConversationSession{
		ID:               newSessionID(now),
		Date:             date,
		StartedAt:        startedAt,
		EndedAt:          endedAt,
		DurationSeconds:  durationSeconds,
		Transcript:       report.Transcript,
		TargetTranscript: report.TargetTranscript,
		TargetSpeaker:    targetSpeaker,
		SpeakerMode:      report.SpeakerMode,
		SpeakerNotice:    report.SpeakerNotice,
		Speakers:         report.Speakers,
		VoiceMatch:       report.VoiceMatch,
		Mistakes:         report.Mistakes,
		Summary:          report.Summary,
	}
}

func reportWithoutVoiceMatch(transcript string, transcription *models.TranscriptionResult, voiceMatch *models.VoiceMatch) *models.AnalysisReport {
	speakers := []string(nil)
	if transcription != nil {
		speakers = transcription.Speakers
	}

	notice := voiceMatchNotice(voiceMatch)
	if notice == "" {
		notice = "Your enrolled voice could not be confidently matched to a speaker."
	}

	return &models.AnalysisReport{
		Transcript:       transcript,
		TargetTranscript: "",
		TargetSpeaker:    "",
		SpeakerMode:      "voice_profile_no_match",
		SpeakerNotice:    notice,
		Speakers:         speakers,
		VoiceMatch:       voiceMatch,
		Mistakes:         []models.Mistake{},
		Summary:          "Your enrolled voice could not be confidently matched in this recording, so no mistakes were reported.",
	}
}

func voiceMatchNotice(voiceMatch *models.VoiceMatch) string {
	if voiceMatch == nil {
		return ""
	}

	return strings.TrimSpace(voiceMatch.Notice)
}

func joinNotices(values ...string) string {
	parts := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			parts = append(parts, value)
		}
	}

	return strings.Join(parts, " ")
}

func parseClientTime(value string, fallback time.Time) time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}

	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return fallback
	}
	return parsed
}

func isValidDate(value string) bool {
	if value == "" {
		return false
	}
	_, err := time.Parse("2006-01-02", value)
	return err == nil
}

func newSessionID(now time.Time) string {
	var randomBytes [4]byte
	if _, err := rand.Read(randomBytes[:]); err != nil {
		return "sess_" + now.UTC().Format("20060102T150405000000000")
	}

	return "sess_" + now.UTC().Format("20060102T150405000000000") + "_" + hex.EncodeToString(randomBytes[:])
}

type requestError string

func (e requestError) Error() string {
	return string(e)
}

func writeAnalysisError(c *gin.Context, err error) {
	if _, ok := err.(requestError); ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
}
