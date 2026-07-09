package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pro-speech/backend/models"
)

const (
	pronunciationStatusAnalyzed    = "analyzed"
	pronunciationStatusDisabled    = "disabled"
	pronunciationStatusSkipped     = "skipped"
	pronunciationStatusUnavailable = "unavailable"

	pronunciationProviderSpeechace = "speechace"

	pronunciationSampleRate       = 16000
	pronunciationMaxChunkSeconds  = 20.0
	pronunciationMinChunkSeconds  = 0.75
	pronunciationContiguousGap    = 0.35
	pronunciationLowScore         = 65.0
	pronunciationSevereScore      = 45.0
	defaultPronunciationMaxChunks = 60
)

type PronunciationAnalyzer interface {
	ProviderName() string
	AnalyzePronunciation(ctx context.Context, chunks []PronunciationChunk) ([]models.Mistake, error)
}

type PronunciationChunk struct {
	ReferenceText string
	AudioData     []byte
	Speaker       string
	StartSeconds  float64
	EndSeconds    float64
}

type pronunciationChunkSpec struct {
	ReferenceText string
	Speaker       string
	AudioRange    *audioSegmentRange
}

type pronunciationPhoneObservation struct {
	ExpectedSound string
	HeardSound    string
	Score         float64
	Word          string
	Speaker       string
}

type speechacePronunciationAnalyzer struct {
	apiKey  string
	baseURL string
	dialect string
	client  *http.Client
}

type speechaceResponse struct {
	Status    string `json:"status"`
	TextScore struct {
		WordScoreList []speechaceWordScore `json:"word_score_list"`
	} `json:"text_score"`
	Detail  string `json:"detail"`
	Message string `json:"message"`
	Error   string `json:"error"`
}

type speechaceWordScore struct {
	Word           string                `json:"word"`
	QualityScore   float64               `json:"quality_score"`
	PhoneScoreList []speechacePhoneScore `json:"phone_score_list"`
}

type speechacePhoneScore struct {
	Phone         string  `json:"phone"`
	QualityScore  float64 `json:"quality_score"`
	SoundMostLike string  `json:"sound_most_like"`
}

func AnalyzePronunciation(audioData []byte, filename string, transcription *models.TranscriptionResult, report *models.AnalysisReport) (*models.PronunciationAnalysis, []models.Mistake) {
	analyzer, status := configuredPronunciationAnalyzer()
	if analyzer == nil {
		return status, nil
	}
	if report == nil {
		return pronunciationUnavailableStatus(analyzer.ProviderName(), "Pronunciation analysis could not run without an analysis report."), nil
	}

	segments := []models.SpeakerSegment(nil)
	if transcription != nil {
		segments = transcription.Segments
	}
	specs := buildPronunciationChunkSpecs(report.TargetSpeaker, report.SpeakerMode, report.TargetTranscript, segments, pronunciationMaxChunks())
	if len(specs) == 0 {
		return &models.PronunciationAnalysis{
			Status:   pronunciationStatusSkipped,
			Provider: analyzer.ProviderName(),
			Notice:   "No target-speaker audio was available for pronunciation analysis.",
		}, nil
	}

	chunks, err := pronunciationAudioChunks(audioData, filename, specs)
	if err != nil {
		return pronunciationUnavailableStatus(analyzer.ProviderName(), err.Error()), nil
	}
	if len(chunks) == 0 {
		return pronunciationUnavailableStatus(analyzer.ProviderName(), "No pronunciation audio chunks could be prepared."), nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(len(chunks))*90*time.Second)
	defer cancel()
	mistakes, err := analyzer.AnalyzePronunciation(ctx, chunks)
	if err != nil {
		return pronunciationUnavailableStatus(analyzer.ProviderName(), "Pronunciation analysis failed: "+err.Error()), nil
	}

	notice := "Pronunciation analysis completed."
	if len(mistakes) == 0 {
		notice = "Pronunciation analysis found no repeated acoustic pronunciation patterns."
	}
	return &models.PronunciationAnalysis{
		Status:         pronunciationStatusAnalyzed,
		Provider:       analyzer.ProviderName(),
		Notice:         notice,
		ChunksAnalyzed: len(chunks),
	}, mistakes
}

func configuredPronunciationAnalyzer() (PronunciationAnalyzer, *models.PronunciationAnalysis) {
	provider := strings.ToLower(strings.TrimSpace(os.Getenv("PRONUNCIATION_PROVIDER")))
	apiKey := strings.TrimSpace(os.Getenv("SPEECHACE_API_KEY"))
	if provider == "" && apiKey != "" {
		provider = pronunciationProviderSpeechace
	}
	if provider == "" || provider == "disabled" || provider == "none" || provider == "off" {
		return nil, &models.PronunciationAnalysis{
			Status:   pronunciationStatusDisabled,
			Provider: pronunciationProviderSpeechace,
			Notice:   "Pronunciation analysis is disabled; set PRONUNCIATION_PROVIDER=speechace and SPEECHACE_API_KEY to enable it.",
		}
	}

	if provider != pronunciationProviderSpeechace {
		return nil, pronunciationUnavailableStatus(provider, "Unsupported pronunciation provider: "+provider)
	}
	if apiKey == "" {
		return nil, &models.PronunciationAnalysis{
			Status:   pronunciationStatusDisabled,
			Provider: pronunciationProviderSpeechace,
			Notice:   "Pronunciation analysis is disabled because SPEECHACE_API_KEY is not set.",
		}
	}

	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("SPEECHACE_BASE_URL")), "/")
	if baseURL == "" {
		baseURL = "https://api.speechace.co"
	}
	dialect := strings.TrimSpace(os.Getenv("SPEECHACE_DIALECT"))
	if dialect == "" {
		dialect = "en-us"
	}

	return &speechacePronunciationAnalyzer{
		apiKey:  apiKey,
		baseURL: baseURL,
		dialect: dialect,
		client:  &http.Client{Timeout: 90 * time.Second},
	}, nil
}

func pronunciationUnavailableStatus(provider string, notice string) *models.PronunciationAnalysis {
	return &models.PronunciationAnalysis{
		Status:   pronunciationStatusUnavailable,
		Provider: provider,
		Notice:   notice,
	}
}

func buildPronunciationChunkSpecs(targetSpeaker string, speakerMode string, targetTranscript string, segments []models.SpeakerSegment, maxChunks int) []pronunciationChunkSpec {
	targetTranscript = strings.TrimSpace(targetTranscript)
	if targetTranscript == "" {
		return nil
	}
	if maxChunks <= 0 {
		maxChunks = defaultPronunciationMaxChunks
	}

	if speakerMode == speakerModeSingleSpeakerGuess {
		return []pronunciationChunkSpec{{
			ReferenceText: targetTranscript,
			Speaker:       targetSpeaker,
			AudioRange:    nil,
		}}
	}

	targetSpeaker = normalizeSpeakerString(targetSpeaker)
	if targetSpeaker == "" {
		return nil
	}

	candidates := make([]pronunciationChunkSpec, 0)
	for _, segment := range segments {
		if !strings.EqualFold(normalizeSpeakerString(segment.Speaker), targetSpeaker) {
			continue
		}
		candidates = append(candidates, pronunciationSpecsFromSegment(segment, targetSpeaker)...)
	}
	if len(candidates) == 0 {
		return nil
	}

	specs := mergePronunciationSpecs(candidates)
	if len(specs) > maxChunks {
		specs = specs[:maxChunks]
	}

	return specs
}

func pronunciationSpecsFromSegment(segment models.SpeakerSegment, targetSpeaker string) []pronunciationChunkSpec {
	text := strings.TrimSpace(segment.Text)
	duration := segment.EndSeconds - segment.StartSeconds
	if text == "" || duration < pronunciationMinChunkSeconds {
		return nil
	}
	if duration <= pronunciationMaxChunkSeconds {
		return []pronunciationChunkSpec{{
			ReferenceText: text,
			Speaker:       targetSpeaker,
			AudioRange: &audioSegmentRange{
				StartSeconds: segment.StartSeconds,
				EndSeconds:   segment.EndSeconds,
			},
		}}
	}

	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}
	partCount := int(math.Ceil(duration / pronunciationMaxChunkSeconds))
	if partCount > len(words) {
		partCount = len(words)
	}

	specs := make([]pronunciationChunkSpec, 0, partCount)
	for i := 0; i < partCount; i++ {
		wordStart := int(math.Round(float64(i) * float64(len(words)) / float64(partCount)))
		wordEnd := int(math.Round(float64(i+1) * float64(len(words)) / float64(partCount)))
		if wordEnd <= wordStart {
			continue
		}

		start := segment.StartSeconds + duration*float64(i)/float64(partCount)
		end := segment.StartSeconds + duration*float64(i+1)/float64(partCount)
		if end-start < pronunciationMinChunkSeconds {
			continue
		}

		specs = append(specs, pronunciationChunkSpec{
			ReferenceText: strings.Join(words[wordStart:wordEnd], " "),
			Speaker:       targetSpeaker,
			AudioRange: &audioSegmentRange{
				StartSeconds: start,
				EndSeconds:   end,
			},
		})
	}

	return specs
}

func mergePronunciationSpecs(candidates []pronunciationChunkSpec) []pronunciationChunkSpec {
	specs := make([]pronunciationChunkSpec, 0, len(candidates))
	var current pronunciationChunkSpec
	for _, candidate := range candidates {
		if candidate.AudioRange == nil {
			continue
		}
		if current.ReferenceText == "" {
			current = candidate
			continue
		}

		gap := candidate.AudioRange.StartSeconds - current.AudioRange.EndSeconds
		mergedDuration := candidate.AudioRange.EndSeconds - current.AudioRange.StartSeconds
		if gap >= 0 && gap <= pronunciationContiguousGap && mergedDuration <= pronunciationMaxChunkSeconds {
			current.ReferenceText = strings.TrimSpace(current.ReferenceText + " " + candidate.ReferenceText)
			current.AudioRange.EndSeconds = candidate.AudioRange.EndSeconds
			continue
		}

		specs = append(specs, current)
		current = candidate
	}
	if current.ReferenceText != "" {
		specs = append(specs, current)
	}

	return specs
}

func pronunciationAudioChunks(audioData []byte, filename string, specs []pronunciationChunkSpec) ([]PronunciationChunk, error) {
	if filename == "" {
		filename = "recording.m4a"
	}

	tempDir, err := os.MkdirTemp("", "pro-speech-pronunciation-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tempDir)

	extension := filepath.Ext(filename)
	if extension == "" {
		extension = ".m4a"
	}
	inputPath := filepath.Join(tempDir, "input"+extension)
	if err := os.WriteFile(inputPath, audioData, 0o600); err != nil {
		return nil, err
	}

	chunks := make([]PronunciationChunk, 0, len(specs))
	var firstErr error
	for _, spec := range specs {
		audio, err := extractPronunciationWAVFromFile(inputPath, spec.AudioRange)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}

		chunk := PronunciationChunk{
			ReferenceText: spec.ReferenceText,
			AudioData:     audio,
			Speaker:       spec.Speaker,
		}
		if spec.AudioRange != nil {
			chunk.StartSeconds = spec.AudioRange.StartSeconds
			chunk.EndSeconds = spec.AudioRange.EndSeconds
		}
		chunks = append(chunks, chunk)
	}
	if len(chunks) == 0 && firstErr != nil {
		return nil, fmt.Errorf("failed to prepare pronunciation audio chunks: %w", firstErr)
	}

	return chunks, nil
}

func extractPronunciationWAVFromFile(inputPath string, audioRange *audioSegmentRange) ([]byte, error) {
	ffmpegPath, err := ffmpegExecutablePath()
	if err != nil {
		return nil, err
	}

	args := []string{"-hide_banner", "-loglevel", "error"}
	if audioRange != nil {
		duration := audioRange.EndSeconds - audioRange.StartSeconds
		if duration <= 0 {
			return nil, fmt.Errorf("invalid audio segment range")
		}
		args = append(args, "-ss", formatSeconds(audioRange.StartSeconds), "-t", formatSeconds(duration))
	}
	args = append(args, "-i", inputPath, "-vn", "-ac", "1", "-ar", strconv.Itoa(pronunciationSampleRate), "-f", "wav", "pipe:1")

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, ffmpegPath, args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}

	return stdout.Bytes(), nil
}

func (a *speechacePronunciationAnalyzer) ProviderName() string {
	return pronunciationProviderSpeechace
}

func (a *speechacePronunciationAnalyzer) AnalyzePronunciation(ctx context.Context, chunks []PronunciationChunk) ([]models.Mistake, error) {
	observations := make([]pronunciationPhoneObservation, 0)
	for _, chunk := range chunks {
		chunkObservations, err := a.scoreChunk(ctx, chunk)
		if err != nil {
			return nil, err
		}
		observations = append(observations, chunkObservations...)
	}

	return pronunciationMistakesFromObservations(observations), nil
}

func (a *speechacePronunciationAnalyzer) scoreChunk(ctx context.Context, chunk PronunciationChunk) ([]pronunciationPhoneObservation, error) {
	endpoint, err := url.Parse(strings.TrimRight(a.baseURL, "/") + "/api/scoring/text/v9/json")
	if err != nil {
		return nil, err
	}
	query := endpoint.Query()
	query.Set("key", a.apiKey)
	query.Set("dialect", a.dialect)
	endpoint.RawQuery = query.Encode()

	var requestBody bytes.Buffer
	writer := multipart.NewWriter(&requestBody)
	if err := writer.WriteField("text", chunk.ReferenceText); err != nil {
		return nil, err
	}
	if err := writer.WriteField("include_unknown_words", "1"); err != nil {
		return nil, err
	}
	fileWriter, err := writer.CreateFormFile("user_audio_file", "chunk.wav")
	if err != nil {
		return nil, err
	}
	if _, err := fileWriter.Write(chunk.AudioData); err != nil {
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), &requestBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Speechace request failed: %w", err)
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("Speechace request failed: %s: %s", resp.Status, strings.TrimSpace(string(responseBody)))
	}

	var parsed speechaceResponse
	if err := json.Unmarshal(responseBody, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse Speechace response: %w", err)
	}
	if !strings.EqualFold(parsed.Status, "success") && len(parsed.TextScore.WordScoreList) == 0 {
		return nil, fmt.Errorf("Speechace returned an unsuccessful response: %s", speechaceErrorMessage(parsed))
	}

	observations := make([]pronunciationPhoneObservation, 0)
	for _, word := range parsed.TextScore.WordScoreList {
		for _, phone := range word.PhoneScoreList {
			expected := normalizePronunciationSound(phone.Phone)
			if expected == "" {
				continue
			}
			observations = append(observations, pronunciationPhoneObservation{
				ExpectedSound: expected,
				HeardSound:    normalizePronunciationSound(phone.SoundMostLike),
				Score:         phone.QualityScore,
				Word:          strings.TrimSpace(word.Word),
				Speaker:       chunk.Speaker,
			})
		}
	}

	return observations, nil
}

func speechaceErrorMessage(response speechaceResponse) string {
	for _, value := range []string{response.Error, response.Message, response.Detail, response.Status} {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}

	return "unknown error"
}

func pronunciationMistakesFromObservations(observations []pronunciationPhoneObservation) []models.Mistake {
	type group struct {
		expected string
		heard    string
		speaker  string
		count    int
		severe   bool
		scoreSum float64
		examples []string
		seenWord map[string]bool
	}

	groups := make(map[string]*group)
	for _, observation := range observations {
		if observation.Score >= pronunciationLowScore {
			continue
		}
		expected := normalizePronunciationSound(observation.ExpectedSound)
		if expected == "" {
			continue
		}
		heard := normalizePronunciationSound(observation.HeardSound)
		if heard == "" {
			heard = "unclear"
		}

		key := observation.Speaker + "|" + expected + "|" + heard
		current := groups[key]
		if current == nil {
			current = &group{
				expected: expected,
				heard:    heard,
				speaker:  observation.Speaker,
				seenWord: make(map[string]bool),
			}
			groups[key] = current
		}
		current.count++
		current.scoreSum += observation.Score
		if observation.Score < pronunciationSevereScore {
			current.severe = true
		}

		word := strings.Trim(strings.ToLower(observation.Word), ".,!?;:\"'()[]{}")
		if word != "" && !current.seenWord[word] && len(current.examples) < 3 {
			current.seenWord[word] = true
			current.examples = append(current.examples, word)
		}
	}

	mistakes := make([]models.Mistake, 0, len(groups))
	for _, current := range groups {
		if current.count < 2 && !current.severe {
			continue
		}

		averageScore := current.scoreSum / float64(current.count)
		mistakes = append(mistakes, models.Mistake{
			Original:   pronunciationOriginal(current.expected, current.heard),
			Correction: pronunciationCorrection(current.expected, current.heard),
			Reason:     pronunciationReason(current.expected, current.count, current.examples),
			Category:   "pronunciation",
			Count:      current.count,
			Speaker:    current.speaker,
			Source:     "pronunciation",
			Confidence: roundConfidence(clamp01((100 - averageScore) / 100)),
			Evidence: &models.PronunciationEvidence{
				ExpectedSound: current.expected,
				HeardSound:    current.heard,
				Score:         roundPronunciationScore(averageScore),
				ExampleWords:  current.examples,
			},
		})
	}

	sort.SliceStable(mistakes, func(i, j int) bool {
		if mistakes[i].Count == mistakes[j].Count {
			leftScore := 100.0
			rightScore := 100.0
			if mistakes[i].Evidence != nil {
				leftScore = mistakes[i].Evidence.Score
			}
			if mistakes[j].Evidence != nil {
				rightScore = mistakes[j].Evidence.Score
			}
			if leftScore == rightScore {
				return mistakes[i].Original < mistakes[j].Original
			}
			return leftScore < rightScore
		}
		return mistakes[i].Count > mistakes[j].Count
	})

	return mistakes
}

func pronunciationOriginal(expected string, heard string) string {
	if heard == "" || heard == "unclear" || heard == expected {
		return "/" + expected + "/ was unclear"
	}

	return "/" + expected + "/ sounded like /" + heard + "/"
}

func pronunciationCorrection(expected string, heard string) string {
	if heard == "" || heard == "unclear" || heard == expected {
		return "Use a clear /" + expected + "/ sound"
	}

	return "Use /" + expected + "/ instead of /" + heard + "/"
}

func pronunciationReason(expected string, count int, examples []string) string {
	reason := fmt.Sprintf("Pronunciation assessment found %d low-scoring /%s/ sound", count, expected)
	if count != 1 {
		reason += "s"
	}
	if len(examples) > 0 {
		reason += " in words like " + strings.Join(examples, ", ")
	}

	return reason + "."
}

func normalizePronunciationSound(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.Trim(value, "/")
	return strings.TrimSpace(value)
}

func roundPronunciationScore(value float64) float64 {
	return math.Round(value*10) / 10
}

func pronunciationMaxChunks() int {
	value := strings.TrimSpace(os.Getenv("PRONUNCIATION_MAX_CHUNKS"))
	if value == "" {
		return defaultPronunciationMaxChunks
	}

	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return defaultPronunciationMaxChunks
	}

	return parsed
}
