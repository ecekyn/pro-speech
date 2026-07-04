package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/pro-speech/backend/models"
)

type lemonfoxTranscriptionResponse struct {
	Text     string            `json:"text"`
	Segments []lemonfoxSegment `json:"segments"`
	Words    []lemonfoxWord    `json:"words"`
}

type lemonfoxSegment struct {
	Text         string  `json:"text"`
	Speaker      any     `json:"speaker"`
	SpeakerLabel any     `json:"speaker_label"`
	Start        float64 `json:"start"`
	End          float64 `json:"end"`
}

type lemonfoxWord struct {
	Word         string  `json:"word"`
	Text         string  `json:"text"`
	Speaker      any     `json:"speaker"`
	SpeakerLabel any     `json:"speaker_label"`
	Start        float64 `json:"start"`
	End          float64 `json:"end"`
}

type speakerChunk struct {
	Speaker string
	Text    string
	Start   float64
	End     float64
}

// TranscribeAudio converts audio to text using Lemonfox.ai STT API.
func TranscribeAudio(audioData []byte, filename string) (*models.TranscriptionResult, error) {
	apiKey := os.Getenv("LEMONFOX_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("LEMONFOX_API_KEY environment variable not set")
	}
	if filename == "" {
		filename = "recording.m4a"
	}

	var requestBody bytes.Buffer
	writer := multipart.NewWriter(&requestBody)
	fileWriter, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, err
	}
	if _, err := io.Copy(fileWriter, bytes.NewReader(audioData)); err != nil {
		return nil, err
	}

	fields := map[string]string{
		"model":           "whisper-1",
		"language":        "english",
		"response_format": "verbose_json",
		"speaker_labels":  "true",
		"prompt":          "Preserve conversational fillers, false starts, repeated words, and spoken disfluencies for English speaking coaching.",
	}
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}

	endpoint := strings.TrimRight(os.Getenv("LEMONFOX_BASE_URL"), "/")
	if endpoint == "" {
		endpoint = "https://api.lemonfox.ai/v1"
	}
	endpoint += "/audio/transcriptions"

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &requestBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("transcription failed: %w", err)
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("transcription failed: %s: %s", resp.Status, strings.TrimSpace(string(responseBody)))
	}

	var parsed lemonfoxTranscriptionResponse
	if err := json.Unmarshal(responseBody, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse transcription response: %w", err)
	}

	chunks := speakerChunksFromSegments(parsed.Segments)
	if len(chunks) == 0 {
		chunks = speakerChunksFromWords(parsed.Words)
	}

	transcript := strings.TrimSpace(parsed.Text)
	speakerTranscript, speakers := buildSpeakerTranscript(chunks)
	if transcript == "" {
		transcript = transcriptTextFromChunks(chunks)
	}

	return &models.TranscriptionResult{
		Transcript:        transcript,
		SpeakerTranscript: speakerTranscript,
		HasSpeakerLabels:  speakerTranscript != "",
		Speakers:          speakers,
		Segments:          speakerSegmentsFromChunks(chunks),
	}, nil
}

func speakerChunksFromSegments(segments []lemonfoxSegment) []speakerChunk {
	chunks := make([]speakerChunk, 0, len(segments))
	for _, segment := range segments {
		text := strings.TrimSpace(segment.Text)
		speaker := normalizeSpeakerValue(firstNonNil(segment.SpeakerLabel, segment.Speaker))
		if text == "" || speaker == "" {
			continue
		}

		chunks = append(chunks, speakerChunk{
			Speaker: speaker,
			Text:    text,
			Start:   segment.Start,
			End:     segment.End,
		})
	}

	return chunks
}

func speakerChunksFromWords(words []lemonfoxWord) []speakerChunk {
	chunks := make([]speakerChunk, 0)
	for _, word := range words {
		text := strings.TrimSpace(word.Word)
		if text == "" {
			text = strings.TrimSpace(word.Text)
		}
		speaker := normalizeSpeakerValue(firstNonNil(word.SpeakerLabel, word.Speaker))
		if text == "" || speaker == "" {
			continue
		}

		chunks = append(chunks, speakerChunk{
			Speaker: speaker,
			Text:    text,
			Start:   word.Start,
			End:     word.End,
		})
	}

	return chunks
}

func buildSpeakerTranscript(chunks []speakerChunk) (string, []string) {
	if len(chunks) == 0 {
		return "", nil
	}

	seenSpeakers := make(map[string]bool)
	speakers := make([]string, 0)
	lines := make([]string, 0)

	currentSpeaker := ""
	currentText := make([]string, 0)
	flush := func() {
		if currentSpeaker == "" || len(currentText) == 0 {
			return
		}
		lines = append(lines, currentSpeaker+": "+strings.Join(currentText, " "))
		currentText = make([]string, 0)
	}

	for _, chunk := range chunks {
		if chunk.Speaker == "" || chunk.Text == "" {
			continue
		}
		if !seenSpeakers[chunk.Speaker] {
			seenSpeakers[chunk.Speaker] = true
			speakers = append(speakers, chunk.Speaker)
		}
		if currentSpeaker != "" && chunk.Speaker != currentSpeaker {
			flush()
		}
		currentSpeaker = chunk.Speaker
		currentText = append(currentText, chunk.Text)
	}
	flush()

	sortSpeakerNames(speakers)
	return strings.Join(lines, "\n"), speakers
}

func transcriptTextFromChunks(chunks []speakerChunk) string {
	parts := make([]string, 0, len(chunks))
	for _, chunk := range chunks {
		if chunk.Text != "" {
			parts = append(parts, chunk.Text)
		}
	}

	return strings.TrimSpace(strings.Join(parts, " "))
}

func speakerSegmentsFromChunks(chunks []speakerChunk) []models.SpeakerSegment {
	segments := make([]models.SpeakerSegment, 0, len(chunks))
	for _, chunk := range chunks {
		if chunk.Speaker == "" || chunk.Text == "" || chunk.End <= chunk.Start {
			continue
		}

		segments = append(segments, models.SpeakerSegment{
			Speaker:      chunk.Speaker,
			Text:         chunk.Text,
			StartSeconds: chunk.Start,
			EndSeconds:   chunk.End,
		})
	}

	return segments
}

func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}

	return nil
}

func normalizeSpeakerValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return normalizeSpeakerString(typed)
	case float64:
		return "Speaker " + strconv.Itoa(int(typed))
	case float32:
		return "Speaker " + strconv.Itoa(int(typed))
	case int:
		return "Speaker " + strconv.Itoa(typed)
	case int64:
		return "Speaker " + strconv.FormatInt(typed, 10)
	case json.Number:
		if index, err := typed.Int64(); err == nil {
			return "Speaker " + strconv.FormatInt(index, 10)
		}
	}

	return normalizeSpeakerString(fmt.Sprint(value))
}

func normalizeSpeakerString(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	digits := digitsOnly(value)
	lower := strings.ToLower(value)
	if digits != "" && (strings.Contains(lower, "speaker") || strings.Contains(lower, "spk") || isDigits(value)) {
		return "Speaker " + normalizeSpeakerIndex(digits)
	}

	if strings.HasPrefix(lower, "speaker ") {
		return "Speaker " + strings.TrimSpace(value[len("speaker "):])
	}

	return "Speaker " + value
}

func digitsOnly(value string) string {
	var builder strings.Builder
	for _, r := range value {
		if unicode.IsDigit(r) {
			builder.WriteRune(r)
		}
	}

	return builder.String()
}

func isDigits(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	for _, r := range value {
		if !unicode.IsDigit(r) {
			return false
		}
	}

	return true
}

func normalizeSpeakerIndex(value string) string {
	value = strings.TrimLeft(value, "0")
	if value == "" {
		return "0"
	}

	return value
}

func sortSpeakerNames(speakers []string) {
	sort.SliceStable(speakers, func(i, j int) bool {
		return speakerSortKey(speakers[i]) < speakerSortKey(speakers[j])
	})
}

func speakerSortKey(speaker string) string {
	parts := strings.Fields(speaker)
	if len(parts) == 2 {
		if index, err := strconv.Atoi(parts[1]); err == nil {
			return fmt.Sprintf("%08d", index)
		}
	}

	return speaker
}
