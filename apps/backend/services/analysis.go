package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/pro-speech/backend/models"
	"github.com/sashabaranov/go-openai"
)

const (
	speakerModeDiarizedTarget     = "diarized_target"
	speakerModeSingleSpeakerGuess = "single_speaker_assumed"
)

type AnalysisOptions struct {
	TargetSpeaker          string
	Speakers               []string
	SpeakerLabelsAvailable bool
}

type selectedSpeech struct {
	Transcript       string
	TargetTranscript string
	TargetSpeaker    string
	SpeakerMode      string
	SpeakerNotice    string
	Speakers         []string
}

type speakerLine struct {
	Speaker string
	Text    string
}

func AnalyzeTranscript(transcript string) (*models.AnalysisReport, error) {
	return AnalyzeTranscriptWithOptions(transcript, AnalysisOptions{})
}

func AnalyzeTranscriptWithOptions(transcript string, options AnalysisOptions) (*models.AnalysisReport, error) {
	transcript = strings.TrimSpace(transcript)
	selection := selectTargetSpeech(transcript, options)
	if transcript == "" {
		return &models.AnalysisReport{
			Transcript:       "",
			TargetTranscript: "",
			TargetSpeaker:    selection.TargetSpeaker,
			SpeakerMode:      selection.SpeakerMode,
			SpeakerNotice:    selection.SpeakerNotice,
			Speakers:         selection.Speakers,
			Mistakes:         []models.Mistake{},
			Summary:          "No speech was detected in this recording.",
		}, nil
	}
	if selection.TargetTranscript == "" {
		return &models.AnalysisReport{
			Transcript:       transcript,
			TargetTranscript: "",
			TargetSpeaker:    selection.TargetSpeaker,
			SpeakerMode:      selection.SpeakerMode,
			SpeakerNotice:    selection.SpeakerNotice,
			Speakers:         selection.Speakers,
			Mistakes:         []models.Mistake{},
			Summary:          "No speech from " + selection.TargetSpeaker + " was detected in this recording.",
		}, nil
	}

	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("OPENAI_API_KEY environment variable not set")
	}

	client := openai.NewClient(apiKey)
	model := os.Getenv("OPENAI_ANALYSIS_MODEL")
	if model == "" {
		model = openai.GPT4oMini
	}

	prompt := fmt.Sprintf(`Analyze only the app user's spoken English in the transcript below.

The app is for speech improvement, not writing improvement. Only include issues that would help someone sound clearer, more natural, or more fluent while speaking in conversation.

Do include:
- pronunciation patterns that can reasonably be inferred from repeated transcription patterns
- filler-word overuse, false starts, repeated restarts, or unclear phrasing
- spoken grammar or spoken word choice that sounds unnatural in conversation
- clarity issues that would affect a listener

Do not include:
- spelling, punctuation, capitalization, paragraphing, or comma usage
- written-style edits that do not matter when speaking
- transcription artifacts, homophones, or proper-noun guesses unless the spoken pattern is clearly repeated
- mistakes made by anyone other than the analyzed speaker

Return a JSON object with this exact structure:
{
  "mistakes": [
    {
      "original": "the spoken phrase or pattern",
      "correction": "what to say instead",
      "reason": "brief speech-coaching explanation",
      "category": "pronunciation|fluency|spoken_grammar|spoken_word_choice|clarity|other",
      "count": 1,
      "speaker": "%s"
    }
  ],
  "summary": "brief speech-focused assessment"
}

Combine repeated instances of the same spoken pattern and set count to the number of occurrences. If there are no speech-relevant mistakes, return an empty mistakes array.

Analyzed speaker: %s
Transcript:
%s`, selection.TargetSpeaker, selection.TargetSpeaker, selection.TargetTranscript)

	resp, err := client.CreateChatCompletion(
		context.Background(),
		openai.ChatCompletionRequest{
			Model: model,
			Messages: []openai.ChatCompletionMessage{
				{
					Role:    openai.ChatMessageRoleSystem,
					Content: "You are an English speaking coach. Return only valid JSON and do not wrap it in markdown.",
				},
				{
					Role:    openai.ChatMessageRoleUser,
					Content: prompt,
				},
			},
			ResponseFormat: &openai.ChatCompletionResponseFormat{
				Type: openai.ChatCompletionResponseFormatTypeJSONObject,
			},
		},
	)

	if err != nil {
		return nil, fmt.Errorf("OpenAI API error: %w", err)
	}
	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("OpenAI API returned no choices")
	}

	var result struct {
		Mistakes []models.Mistake `json:"mistakes"`
		Summary  string           `json:"summary"`
	}

	content := strings.TrimSpace(resp.Choices[0].Message.Content)
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, fmt.Errorf("failed to parse OpenAI response: %w", err)
	}
	if result.Mistakes == nil {
		result.Mistakes = []models.Mistake{}
	}
	for i := range result.Mistakes {
		if result.Mistakes[i].Count == 0 {
			result.Mistakes[i].Count = 1
		}
		if strings.TrimSpace(result.Mistakes[i].Speaker) == "" {
			result.Mistakes[i].Speaker = selection.TargetSpeaker
		}
	}
	if strings.TrimSpace(result.Summary) == "" {
		result.Summary = "No speech-focused summary was returned for this session."
	}

	return &models.AnalysisReport{
		Transcript:       transcript,
		TargetTranscript: selection.TargetTranscript,
		TargetSpeaker:    selection.TargetSpeaker,
		SpeakerMode:      selection.SpeakerMode,
		SpeakerNotice:    selection.SpeakerNotice,
		Speakers:         selection.Speakers,
		Mistakes:         result.Mistakes,
		Summary:          result.Summary,
	}, nil
}

func selectTargetSpeech(transcript string, options AnalysisOptions) selectedSpeech {
	transcript = strings.TrimSpace(transcript)
	lines := parseSpeakerLines(transcript)
	speakers := normalizedSpeakerList(options.Speakers)
	if len(speakers) == 0 {
		speakers = speakersFromLines(lines)
	}

	hasSpeakerLabels := options.SpeakerLabelsAvailable || len(lines) > 0
	targetSpeaker := chooseTargetSpeaker(options.TargetSpeaker, speakers, hasSpeakerLabels)

	if !hasSpeakerLabels {
		return selectedSpeech{
			Transcript:       transcript,
			TargetTranscript: transcript,
			TargetSpeaker:    targetSpeaker,
			SpeakerMode:      speakerModeSingleSpeakerGuess,
			SpeakerNotice:    "Speaker labels were not available; this session assumes the recording is the app user's speech.",
			Speakers:         speakers,
		}
	}

	targetTranscript := textForSpeaker(lines, targetSpeaker)
	return selectedSpeech{
		Transcript:       transcript,
		TargetTranscript: targetTranscript,
		TargetSpeaker:    targetSpeaker,
		SpeakerMode:      speakerModeDiarizedTarget,
		SpeakerNotice:    "Only " + targetSpeaker + " was analyzed; other speakers were ignored.",
		Speakers:         speakers,
	}
}

func parseSpeakerLines(transcript string) []speakerLine {
	lines := make([]speakerLine, 0)
	for _, rawLine := range strings.Split(transcript, "\n") {
		rawLine = strings.TrimSpace(rawLine)
		if rawLine == "" {
			continue
		}

		label, text, ok := strings.Cut(rawLine, ":")
		if !ok || len(label) > 40 {
			continue
		}

		speaker := normalizeSpeakerLabel(label)
		text = strings.TrimSpace(text)
		if speaker == "" || text == "" {
			continue
		}

		lines = append(lines, speakerLine{Speaker: speaker, Text: text})
	}

	return lines
}

func normalizeSpeakerLabel(label string) string {
	label = strings.TrimSpace(label)
	if label == "" {
		return ""
	}

	lower := strings.ToLower(label)
	if !strings.Contains(lower, "speaker") && !strings.Contains(lower, "spk") && !isDigits(label) {
		return ""
	}

	return normalizeSpeakerString(label)
}

func normalizedSpeakerList(values []string) []string {
	seen := make(map[string]bool)
	speakers := make([]string, 0, len(values))
	for _, value := range values {
		speaker := normalizeSpeakerString(value)
		if speaker == "" || seen[speaker] {
			continue
		}
		seen[speaker] = true
		speakers = append(speakers, speaker)
	}
	sortSpeakerNames(speakers)

	return speakers
}

func speakersFromLines(lines []speakerLine) []string {
	seen := make(map[string]bool)
	speakers := make([]string, 0)
	for _, line := range lines {
		if line.Speaker == "" || seen[line.Speaker] {
			continue
		}
		seen[line.Speaker] = true
		speakers = append(speakers, line.Speaker)
	}
	sortSpeakerNames(speakers)

	return speakers
}

func chooseTargetSpeaker(target string, speakers []string, hasSpeakerLabels bool) string {
	normalizedTarget := normalizeSpeakerString(target)
	if normalizedTarget != "" {
		return normalizedTarget
	}
	if !hasSpeakerLabels {
		return "App user"
	}
	if containsSpeaker(speakers, "Speaker 0") {
		return "Speaker 0"
	}
	if len(speakers) > 0 {
		return speakers[0]
	}

	return "Speaker 0"
}

func containsSpeaker(speakers []string, speaker string) bool {
	for _, candidate := range speakers {
		if strings.EqualFold(candidate, speaker) {
			return true
		}
	}

	return false
}

func textForSpeaker(lines []speakerLine, targetSpeaker string) string {
	parts := make([]string, 0)
	for _, line := range lines {
		if strings.EqualFold(line.Speaker, targetSpeaker) {
			parts = append(parts, line.Text)
		}
	}

	return strings.TrimSpace(strings.Join(parts, " "))
}
