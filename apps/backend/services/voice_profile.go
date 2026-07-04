package services

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pro-speech/backend/models"
)

const (
	voiceMatchStatusMatched          = "matched"
	voiceMatchStatusNotEnrolled      = "not_enrolled"
	voiceMatchStatusNoConfidentMatch = "no_confident_match"
	voiceMatchStatusUnavailable      = "unavailable"
)

const voiceFingerprintSampleRate = 16000

type VoiceProfileStore struct {
	mu   sync.Mutex
	path string
}

type storedVoiceProfile struct {
	CreatedAt   time.Time        `json:"created_at"`
	UpdatedAt   time.Time        `json:"updated_at"`
	SampleCount int              `json:"sample_count"`
	Fingerprint audioFingerprint `json:"fingerprint"`
}

type audioFingerprint struct {
	DurationSeconds  float64 `json:"duration_seconds"`
	RMSMean          float64 `json:"rms_mean"`
	RMSStd           float64 `json:"rms_std"`
	ZeroCrossingMean float64 `json:"zero_crossing_mean"`
	ZeroCrossingStd  float64 `json:"zero_crossing_std"`
	PitchMean        float64 `json:"pitch_mean"`
	PitchStd         float64 `json:"pitch_std"`
	VoicedRatio      float64 `json:"voiced_ratio"`
}

type audioSegmentRange struct {
	StartSeconds float64
	EndSeconds   float64
}

var (
	defaultVoiceProfileStore     *VoiceProfileStore
	defaultVoiceProfileStoreErr  error
	defaultVoiceProfileStoreOnce sync.Once
)

func DefaultVoiceProfileStore() (*VoiceProfileStore, error) {
	defaultVoiceProfileStoreOnce.Do(func() {
		defaultVoiceProfileStore, defaultVoiceProfileStoreErr = NewVoiceProfileStore("")
	})
	return defaultVoiceProfileStore, defaultVoiceProfileStoreErr
}

func NewVoiceProfileStore(path string) (*VoiceProfileStore, error) {
	if path == "" {
		path = os.Getenv("PRO_SPEECH_VOICE_PROFILE_PATH")
	}
	if path == "" {
		path = "data/voice_profile.json"
	}

	return &VoiceProfileStore{path: path}, nil
}

func EnrollDefaultVoiceProfile(audioData []byte, filename string) (*models.VoiceProfileStatus, error) {
	store, err := DefaultVoiceProfileStore()
	if err != nil {
		return nil, err
	}

	return store.Enroll(audioData, filename)
}

func DefaultVoiceProfileStatus() (*models.VoiceProfileStatus, error) {
	store, err := DefaultVoiceProfileStore()
	if err != nil {
		return nil, err
	}

	return store.Status()
}

func DeleteDefaultVoiceProfile() error {
	store, err := DefaultVoiceProfileStore()
	if err != nil {
		return err
	}

	return store.Delete()
}

func IdentifyUserSpeaker(audioData []byte, filename string, transcription *models.TranscriptionResult) (*models.VoiceMatch, error) {
	store, err := DefaultVoiceProfileStore()
	if err != nil {
		return nil, err
	}

	return store.Identify(audioData, filename, transcription)
}

func (s *VoiceProfileStore) Status() (*models.VoiceProfileStatus, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	profile, err := s.loadLocked()
	if errors.Is(err, os.ErrNotExist) {
		return &models.VoiceProfileStatus{Enrolled: false}, nil
	}
	if err != nil {
		return nil, err
	}

	return voiceProfileStatus(profile), nil
}

func (s *VoiceProfileStore) Enroll(audioData []byte, filename string) (*models.VoiceProfileStatus, error) {
	fingerprint, err := extractAudioFingerprint(audioData, filename, nil)
	if err != nil {
		return nil, err
	}
	if fingerprint.DurationSeconds < 2 {
		return nil, fmt.Errorf("voice sample is too short; record at least 2 seconds")
	}

	now := time.Now().UTC()

	s.mu.Lock()
	defer s.mu.Unlock()

	profile, err := s.loadLocked()
	if errors.Is(err, os.ErrNotExist) {
		profile = storedVoiceProfile{
			CreatedAt:   now,
			UpdatedAt:   now,
			SampleCount: 1,
			Fingerprint: fingerprint,
		}
	} else if err != nil {
		return nil, err
	} else {
		profile.Fingerprint = mergeFingerprints(profile.Fingerprint, fingerprint, profile.SampleCount)
		profile.SampleCount++
		profile.UpdatedAt = now
	}

	if err := s.saveLocked(profile); err != nil {
		return nil, err
	}

	return voiceProfileStatus(profile), nil
}

func (s *VoiceProfileStore) Identify(audioData []byte, filename string, transcription *models.TranscriptionResult) (*models.VoiceMatch, error) {
	s.mu.Lock()
	profile, err := s.loadLocked()
	s.mu.Unlock()

	if errors.Is(err, os.ErrNotExist) {
		return &models.VoiceMatch{
			Status: voiceMatchStatusNotEnrolled,
			Notice: "No voice profile is enrolled yet; default speaker selection will be used.",
		}, nil
	}
	if err != nil {
		return nil, err
	}
	if transcription == nil || len(transcription.Segments) == 0 {
		return &models.VoiceMatch{
			Status: voiceMatchStatusUnavailable,
			Notice: "Voice matching needs speaker-labeled transcript segments with timestamps.",
		}, nil
	}

	candidates := make(map[string]audioFingerprint)
	for _, speaker := range transcription.Speakers {
		fingerprint, err := fingerprintForSpeaker(audioData, filename, speaker, transcription.Segments)
		if err != nil {
			continue
		}
		candidates[speaker] = fingerprint
	}
	if len(candidates) == 0 {
		return &models.VoiceMatch{
			Status: voiceMatchStatusUnavailable,
			Notice: "Voice matching could not extract enough speech for any diarized speaker.",
		}, nil
	}

	match := matchSpeakerScores(profile.Fingerprint, candidates, voiceMatchMinScore(), voiceMatchMinMargin())
	return &match, nil
}

func (s *VoiceProfileStore) Delete() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.Remove(s.path); errors.Is(err, os.ErrNotExist) {
		return nil
	} else if err != nil {
		return err
	}

	return nil
}

func (s *VoiceProfileStore) loadLocked() (storedVoiceProfile, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return storedVoiceProfile{}, err
	}

	var profile storedVoiceProfile
	if err := json.Unmarshal(data, &profile); err != nil {
		return storedVoiceProfile{}, err
	}
	if profile.SampleCount <= 0 {
		return storedVoiceProfile{}, os.ErrNotExist
	}

	return profile, nil
}

func (s *VoiceProfileStore) saveLocked(profile storedVoiceProfile) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(profile, "", "  ")
	if err != nil {
		return err
	}

	tmpPath := s.path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o600); err != nil {
		return err
	}

	return os.Rename(tmpPath, s.path)
}

func voiceProfileStatus(profile storedVoiceProfile) *models.VoiceProfileStatus {
	return &models.VoiceProfileStatus{
		Enrolled:    profile.SampleCount > 0,
		CreatedAt:   profile.CreatedAt,
		UpdatedAt:   profile.UpdatedAt,
		SampleCount: profile.SampleCount,
	}
}

func fingerprintForSpeaker(audioData []byte, filename string, speaker string, segments []models.SpeakerSegment) (audioFingerprint, error) {
	ranges := rangesForSpeaker(speaker, segments)
	if len(ranges) == 0 {
		return audioFingerprint{}, fmt.Errorf("no timed segments for %s", speaker)
	}

	fingerprints := make([]audioFingerprint, 0, len(ranges))
	weights := make([]float64, 0, len(ranges))
	for _, audioRange := range ranges {
		fingerprint, err := extractAudioFingerprint(audioData, filename, &audioRange)
		if err != nil {
			continue
		}

		fingerprints = append(fingerprints, fingerprint)
		weights = append(weights, math.Max(0.1, fingerprint.DurationSeconds))
	}
	if len(fingerprints) == 0 {
		return audioFingerprint{}, fmt.Errorf("failed to fingerprint %s", speaker)
	}

	return weightedFingerprint(fingerprints, weights), nil
}

func rangesForSpeaker(speaker string, segments []models.SpeakerSegment) []audioSegmentRange {
	const maxSegments = 8
	const maxSeconds = 30
	const minSegmentSeconds = 0.75

	ranges := make([]audioSegmentRange, 0, maxSegments)
	totalSeconds := 0.0
	for _, segment := range segments {
		if !strings.EqualFold(segment.Speaker, speaker) {
			continue
		}
		duration := segment.EndSeconds - segment.StartSeconds
		if duration < minSegmentSeconds {
			continue
		}

		if totalSeconds+duration > maxSeconds {
			duration = maxSeconds - totalSeconds
		}
		if duration < minSegmentSeconds {
			break
		}

		ranges = append(ranges, audioSegmentRange{
			StartSeconds: segment.StartSeconds,
			EndSeconds:   segment.StartSeconds + duration,
		})
		totalSeconds += duration
		if len(ranges) >= maxSegments || totalSeconds >= maxSeconds {
			break
		}
	}

	return ranges
}

func extractAudioFingerprint(audioData []byte, filename string, audioRange *audioSegmentRange) (audioFingerprint, error) {
	if filename == "" {
		filename = "recording.m4a"
	}

	tempDir, err := os.MkdirTemp("", "pro-speech-voice-*")
	if err != nil {
		return audioFingerprint{}, err
	}
	defer os.RemoveAll(tempDir)

	extension := filepath.Ext(filename)
	if extension == "" {
		extension = ".m4a"
	}
	inputPath := filepath.Join(tempDir, "input"+extension)
	if err := os.WriteFile(inputPath, audioData, 0o600); err != nil {
		return audioFingerprint{}, err
	}

	return extractAudioFingerprintFromFile(inputPath, audioRange)
}

func extractAudioFingerprintFromFile(inputPath string, audioRange *audioSegmentRange) (audioFingerprint, error) {
	ffmpegPath, err := ffmpegExecutablePath()
	if err != nil {
		return audioFingerprint{}, err
	}

	args := []string{"-hide_banner", "-loglevel", "error"}
	if audioRange != nil {
		duration := audioRange.EndSeconds - audioRange.StartSeconds
		if duration <= 0 {
			return audioFingerprint{}, fmt.Errorf("invalid audio segment range")
		}
		args = append(args, "-ss", formatSeconds(audioRange.StartSeconds), "-t", formatSeconds(duration))
	}
	args = append(args, "-i", inputPath, "-ac", "1", "-ar", strconv.Itoa(voiceFingerprintSampleRate), "-f", "s16le", "pipe:1")

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, ffmpegPath, args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return audioFingerprint{}, fmt.Errorf("ffmpeg failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}

	return fingerprintFromPCM(stdout.Bytes(), voiceFingerprintSampleRate)
}

func fingerprintFromPCM(raw []byte, sampleRate int) (audioFingerprint, error) {
	if len(raw) < sampleRate {
		return audioFingerprint{}, fmt.Errorf("not enough audio for voice fingerprint")
	}
	if len(raw)%2 != 0 {
		raw = raw[:len(raw)-1]
	}

	samples := make([]int16, len(raw)/2)
	for i := range samples {
		samples[i] = int16(binary.LittleEndian.Uint16(raw[i*2 : i*2+2]))
	}

	frameSize := int(0.025 * float64(sampleRate))
	hopSize := int(0.010 * float64(sampleRate))
	if frameSize <= 0 || hopSize <= 0 || len(samples) < frameSize {
		return audioFingerprint{}, fmt.Errorf("not enough audio for voice fingerprint")
	}

	rmsValues := make([]float64, 0)
	zeroCrossingValues := make([]float64, 0)
	pitchValues := make([]float64, 0)
	voicedFrames := 0

	for start := 0; start+frameSize <= len(samples); start += hopSize {
		frame := samples[start : start+frameSize]
		rms := frameRMS(frame)
		if rms < 0.005 {
			continue
		}

		rmsValues = append(rmsValues, rms)
		zeroCrossingValues = append(zeroCrossingValues, frameZeroCrossingRate(frame))
		if pitch, ok := framePitch(frame, sampleRate); ok {
			pitchValues = append(pitchValues, pitch)
			voicedFrames++
		}
	}

	if len(rmsValues) < 5 {
		return audioFingerprint{}, fmt.Errorf("not enough voiced audio for voice fingerprint")
	}

	rmsMean, rmsStd := meanStd(rmsValues)
	zcrMean, zcrStd := meanStd(zeroCrossingValues)
	pitchMean, pitchStd := meanStd(pitchValues)

	return audioFingerprint{
		DurationSeconds:  float64(len(samples)) / float64(sampleRate),
		RMSMean:          rmsMean,
		RMSStd:           rmsStd,
		ZeroCrossingMean: zcrMean,
		ZeroCrossingStd:  zcrStd,
		PitchMean:        pitchMean,
		PitchStd:         pitchStd,
		VoicedRatio:      float64(voicedFrames) / float64(len(rmsValues)),
	}, nil
}

func frameRMS(frame []int16) float64 {
	sum := 0.0
	for _, sample := range frame {
		value := float64(sample) / 32767.0
		sum += value * value
	}

	return math.Sqrt(sum / float64(len(frame)))
}

func frameZeroCrossingRate(frame []int16) float64 {
	if len(frame) < 2 {
		return 0
	}

	crossings := 0
	for i := 1; i < len(frame); i++ {
		if (frame[i-1] < 0 && frame[i] >= 0) || (frame[i-1] >= 0 && frame[i] < 0) {
			crossings++
		}
	}

	return float64(crossings) / float64(len(frame)-1)
}

func framePitch(frame []int16, sampleRate int) (float64, bool) {
	minLag := sampleRate / 300
	maxLag := sampleRate / 75
	if maxLag >= len(frame) {
		maxLag = len(frame) - 1
	}

	bestLag := 0
	bestCorrelation := 0.0
	for lag := minLag; lag <= maxLag; lag++ {
		sum := 0.0
		leftEnergy := 0.0
		rightEnergy := 0.0
		for i := 0; i+lag < len(frame); i++ {
			left := float64(frame[i])
			right := float64(frame[i+lag])
			sum += left * right
			leftEnergy += left * left
			rightEnergy += right * right
		}
		if leftEnergy == 0 || rightEnergy == 0 {
			continue
		}

		correlation := sum / math.Sqrt(leftEnergy*rightEnergy)
		if correlation > bestCorrelation {
			bestCorrelation = correlation
			bestLag = lag
		}
	}

	if bestLag == 0 || bestCorrelation < 0.35 {
		return 0, false
	}

	return float64(sampleRate) / float64(bestLag), true
}

func meanStd(values []float64) (float64, float64) {
	if len(values) == 0 {
		return 0, 0
	}

	mean := 0.0
	for _, value := range values {
		mean += value
	}
	mean /= float64(len(values))

	variance := 0.0
	for _, value := range values {
		diff := value - mean
		variance += diff * diff
	}
	variance /= float64(len(values))

	return mean, math.Sqrt(variance)
}

func mergeFingerprints(existing audioFingerprint, incoming audioFingerprint, existingCount int) audioFingerprint {
	if existingCount <= 0 {
		return incoming
	}

	weight := float64(existingCount)
	return audioFingerprint{
		DurationSeconds:  weightedAverage(existing.DurationSeconds, weight, incoming.DurationSeconds, 1),
		RMSMean:          weightedAverage(existing.RMSMean, weight, incoming.RMSMean, 1),
		RMSStd:           weightedAverage(existing.RMSStd, weight, incoming.RMSStd, 1),
		ZeroCrossingMean: weightedAverage(existing.ZeroCrossingMean, weight, incoming.ZeroCrossingMean, 1),
		ZeroCrossingStd:  weightedAverage(existing.ZeroCrossingStd, weight, incoming.ZeroCrossingStd, 1),
		PitchMean:        weightedAverage(existing.PitchMean, weight, incoming.PitchMean, 1),
		PitchStd:         weightedAverage(existing.PitchStd, weight, incoming.PitchStd, 1),
		VoicedRatio:      weightedAverage(existing.VoicedRatio, weight, incoming.VoicedRatio, 1),
	}
}

func weightedFingerprint(fingerprints []audioFingerprint, weights []float64) audioFingerprint {
	if len(fingerprints) == 0 {
		return audioFingerprint{}
	}
	if len(weights) != len(fingerprints) {
		weights = make([]float64, len(fingerprints))
		for i := range weights {
			weights[i] = 1
		}
	}

	totalWeight := 0.0
	result := audioFingerprint{}
	for i, fingerprint := range fingerprints {
		weight := weights[i]
		totalWeight += weight
		result.DurationSeconds += fingerprint.DurationSeconds * weight
		result.RMSMean += fingerprint.RMSMean * weight
		result.RMSStd += fingerprint.RMSStd * weight
		result.ZeroCrossingMean += fingerprint.ZeroCrossingMean * weight
		result.ZeroCrossingStd += fingerprint.ZeroCrossingStd * weight
		result.PitchMean += fingerprint.PitchMean * weight
		result.PitchStd += fingerprint.PitchStd * weight
		result.VoicedRatio += fingerprint.VoicedRatio * weight
	}
	if totalWeight == 0 {
		return result
	}

	result.DurationSeconds /= totalWeight
	result.RMSMean /= totalWeight
	result.RMSStd /= totalWeight
	result.ZeroCrossingMean /= totalWeight
	result.ZeroCrossingStd /= totalWeight
	result.PitchMean /= totalWeight
	result.PitchStd /= totalWeight
	result.VoicedRatio /= totalWeight

	return result
}

func weightedAverage(existing float64, existingWeight float64, incoming float64, incomingWeight float64) float64 {
	totalWeight := existingWeight + incomingWeight
	if totalWeight == 0 {
		return 0
	}

	return ((existing * existingWeight) + (incoming * incomingWeight)) / totalWeight
}

func matchSpeakerScores(profile audioFingerprint, candidates map[string]audioFingerprint, minScore float64, minMargin float64) models.VoiceMatch {
	scores := make([]models.SpeakerScore, 0, len(candidates))
	for speaker, fingerprint := range candidates {
		scores = append(scores, models.SpeakerScore{
			Speaker: speaker,
			Score:   roundConfidence(scoreFingerprints(profile, fingerprint)),
		})
	}
	sort.SliceStable(scores, func(i, j int) bool {
		if scores[i].Score == scores[j].Score {
			return scores[i].Speaker < scores[j].Speaker
		}

		return scores[i].Score > scores[j].Score
	})

	if len(scores) == 0 {
		return models.VoiceMatch{
			Status: voiceMatchStatusUnavailable,
			Notice: "No speaker candidates were available for voice matching.",
		}
	}

	best := scores[0]
	secondScore := 0.0
	if len(scores) > 1 {
		secondScore = scores[1].Score
	}
	margin := best.Score - secondScore
	if best.Score >= minScore && (len(scores) == 1 || margin >= minMargin) {
		return models.VoiceMatch{
			Status:     voiceMatchStatusMatched,
			Speaker:    best.Speaker,
			Confidence: best.Score,
			Scores:     scores,
			Notice:     fmt.Sprintf("Matched your enrolled voice to %s with %.0f%% confidence.", best.Speaker, best.Score*100),
		}
	}

	return models.VoiceMatch{
		Status:     voiceMatchStatusNoConfidentMatch,
		Speaker:    best.Speaker,
		Confidence: best.Score,
		Scores:     scores,
		Notice:     fmt.Sprintf("Your enrolled voice did not confidently match a speaker; best candidate was %s at %.0f%%.", best.Speaker, best.Score*100),
	}
}

func scoreFingerprints(profile audioFingerprint, candidate audioFingerprint) float64 {
	profileVector := profile.featureVector()
	candidateVector := candidate.featureVector()
	weights := []float64{0.8, 0.6, 0.8, 0.6, 2.2, 1.2, 1.0}

	totalWeight := 0.0
	weightedDiff := 0.0
	for i := range profileVector {
		weight := weights[i]
		totalWeight += weight
		weightedDiff += math.Abs(profileVector[i]-candidateVector[i]) * weight
	}
	if totalWeight == 0 {
		return 0
	}

	return clamp01(1 - (weightedDiff / totalWeight))
}

func (f audioFingerprint) featureVector() []float64 {
	return []float64{
		clamp01(f.RMSMean * 20),
		clamp01(f.RMSStd * 40),
		clamp01(f.ZeroCrossingMean * 10),
		clamp01(f.ZeroCrossingStd * 20),
		clamp01((f.PitchMean - 75) / 225),
		clamp01(f.PitchStd / 100),
		clamp01(f.VoicedRatio),
	}
}

func voiceMatchMinScore() float64 {
	return envFloat("VOICE_MATCH_MIN_SCORE", 0.78)
}

func voiceMatchMinMargin() float64 {
	return envFloat("VOICE_MATCH_MIN_MARGIN", 0.03)
}

func envFloat(key string, fallback float64) float64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}

	return parsed
}

func ffmpegExecutablePath() (string, error) {
	if configured := strings.TrimSpace(os.Getenv("FFMPEG_PATH")); configured != "" {
		return configured, nil
	}

	path, err := exec.LookPath("ffmpeg")
	if err != nil {
		return "", fmt.Errorf("ffmpeg is required for voice matching; install ffmpeg or set FFMPEG_PATH")
	}

	return path, nil
}

func formatSeconds(value float64) string {
	return strconv.FormatFloat(value, 'f', 3, 64)
}

func clamp01(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 1 {
		return 1
	}

	return value
}

func roundConfidence(value float64) float64 {
	return math.Round(clamp01(value)*100) / 100
}
