package services

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pro-speech/backend/models"
)

func TestBuildPronunciationChunkSpecsFiltersTargetSpeaker(t *testing.T) {
	segments := []models.SpeakerSegment{
		{Speaker: "Speaker 0", Text: "Very vivid", StartSeconds: 0, EndSeconds: 2},
		{Speaker: "Speaker 1", Text: "Other speaker", StartSeconds: 2.1, EndSeconds: 3},
		{Speaker: "Speaker 0", Text: "v", StartSeconds: 3.2, EndSeconds: 3.7},
		{Speaker: "Speaker 0", Text: "We visit", StartSeconds: 4, EndSeconds: 5.5},
		{Speaker: "Speaker 0", Text: "vowels", StartSeconds: 5.7, EndSeconds: 7},
	}

	specs := buildPronunciationChunkSpecs("Speaker 0", speakerModeDiarizedTarget, "Very vivid We visit vowels", segments, 60)

	if len(specs) != 2 {
		t.Fatalf("expected 2 chunks, got %d: %#v", len(specs), specs)
	}
	if specs[0].ReferenceText != "Very vivid" {
		t.Fatalf("unexpected first reference: %q", specs[0].ReferenceText)
	}
	if specs[0].AudioRange == nil || specs[0].AudioRange.StartSeconds != 0 || specs[0].AudioRange.EndSeconds != 2 {
		t.Fatalf("unexpected first range: %#v", specs[0].AudioRange)
	}
	if specs[1].ReferenceText != "We visit vowels" {
		t.Fatalf("unexpected merged reference: %q", specs[1].ReferenceText)
	}
	if specs[1].AudioRange == nil || specs[1].AudioRange.StartSeconds != 4 || specs[1].AudioRange.EndSeconds != 7 {
		t.Fatalf("unexpected merged range: %#v", specs[1].AudioRange)
	}
}

func TestBuildPronunciationChunkSpecsSingleSpeakerFallbackUsesFullAudio(t *testing.T) {
	specs := buildPronunciationChunkSpecs("App user", speakerModeSingleSpeakerGuess, "Hello world", nil, 60)

	if len(specs) != 1 {
		t.Fatalf("expected one full-audio chunk, got %d", len(specs))
	}
	if specs[0].ReferenceText != "Hello world" {
		t.Fatalf("unexpected reference: %q", specs[0].ReferenceText)
	}
	if specs[0].AudioRange != nil {
		t.Fatalf("expected full-audio fallback without a range, got %#v", specs[0].AudioRange)
	}
}

func TestBuildPronunciationChunkSpecsSkipsShortSegmentsAndCapsChunks(t *testing.T) {
	segments := []models.SpeakerSegment{
		{Speaker: "Speaker 0", Text: "a", StartSeconds: 0, EndSeconds: 0.4},
		{Speaker: "Speaker 0", Text: "one", StartSeconds: 1, EndSeconds: 2},
		{Speaker: "Speaker 0", Text: "two", StartSeconds: 3, EndSeconds: 4},
		{Speaker: "Speaker 0", Text: "three", StartSeconds: 5, EndSeconds: 6},
		{Speaker: "Speaker 0", Text: "four", StartSeconds: 7, EndSeconds: 8},
	}

	specs := buildPronunciationChunkSpecs("Speaker 0", speakerModeDiarizedTarget, "one two three four", segments, 3)

	if len(specs) != 3 {
		t.Fatalf("expected cap of 3 chunks, got %d", len(specs))
	}
	for _, spec := range specs {
		if spec.ReferenceText == "a" {
			t.Fatal("short segment was not skipped")
		}
	}
}

func TestPronunciationMistakesFromObservationsGroupsVAsW(t *testing.T) {
	mistakes := pronunciationMistakesFromObservations([]pronunciationPhoneObservation{
		{ExpectedSound: "v", HeardSound: "w", Score: 61, Word: "very", Speaker: "Speaker 0"},
		{ExpectedSound: "v", HeardSound: "w", Score: 63, Word: "vivid", Speaker: "Speaker 0"},
		{ExpectedSound: "th", HeardSound: "d", Score: 60, Word: "this", Speaker: "Speaker 0"},
	})

	if len(mistakes) != 1 {
		t.Fatalf("expected one repeated pronunciation mistake, got %d: %#v", len(mistakes), mistakes)
	}
	mistake := mistakes[0]
	if mistake.Original != "/v/ sounded like /w/" {
		t.Fatalf("unexpected original: %q", mistake.Original)
	}
	if mistake.Count != 2 {
		t.Fatalf("expected count 2, got %d", mistake.Count)
	}
	if mistake.Evidence == nil || mistake.Evidence.ExpectedSound != "v" || mistake.Evidence.HeardSound != "w" {
		t.Fatalf("unexpected evidence: %#v", mistake.Evidence)
	}
	if mistake.Evidence.Score != 62 {
		t.Fatalf("expected average score 62, got %v", mistake.Evidence.Score)
	}
}

func TestPronunciationMistakesFromObservationsFlagsSingleSevereScore(t *testing.T) {
	mistakes := pronunciationMistakesFromObservations([]pronunciationPhoneObservation{
		{ExpectedSound: "r", HeardSound: "l", Score: 40, Word: "right", Speaker: "Speaker 0"},
	})

	if len(mistakes) != 1 {
		t.Fatalf("expected one severe pronunciation mistake, got %d", len(mistakes))
	}
	if mistakes[0].Count != 1 {
		t.Fatalf("expected count 1, got %d", mistakes[0].Count)
	}
}

func TestSpeechacePronunciationAnalyzerUsesProviderResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/scoring/text/v9/json" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("key") != "secret" || r.URL.Query().Get("dialect") != "en-us" {
			t.Fatalf("unexpected query: %s", r.URL.RawQuery)
		}
		if err := r.ParseMultipartForm(1024 * 1024); err != nil {
			t.Fatalf("failed to parse multipart request: %v", err)
		}
		if strings.TrimSpace(r.FormValue("text")) != "very" {
			t.Fatalf("unexpected reference text: %q", r.FormValue("text"))
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"status": "success",
			"text_score": {
				"word_score_list": [
					{
						"word": "very",
						"phone_score_list": [
							{"phone": "v", "quality_score": 40, "sound_most_like": "w"}
						]
					}
				]
			}
		}`))
	}))
	defer server.Close()

	analyzer := &speechacePronunciationAnalyzer{
		apiKey:  "secret",
		baseURL: server.URL,
		dialect: "en-us",
		client:  server.Client(),
	}

	mistakes, err := analyzer.AnalyzePronunciation(context.Background(), []PronunciationChunk{
		{ReferenceText: "very", AudioData: []byte("fake wav"), Speaker: "Speaker 0"},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mistakes) != 1 {
		t.Fatalf("expected one mistake, got %d", len(mistakes))
	}
	if mistakes[0].Original != "/v/ sounded like /w/" {
		t.Fatalf("unexpected mistake: %#v", mistakes[0])
	}
}

func TestSpeechacePronunciationAnalyzerReturnsProviderFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusBadGateway)
	}))
	defer server.Close()

	analyzer := &speechacePronunciationAnalyzer{
		apiKey:  "secret",
		baseURL: server.URL,
		dialect: "en-us",
		client:  server.Client(),
	}

	_, err := analyzer.AnalyzePronunciation(context.Background(), []PronunciationChunk{
		{ReferenceText: "very", AudioData: []byte("fake wav"), Speaker: "Speaker 0"},
	})

	if err == nil {
		t.Fatal("expected provider error")
	}
}

func TestConfiguredPronunciationAnalyzerDisabledWithoutProvider(t *testing.T) {
	t.Setenv("PRONUNCIATION_PROVIDER", "")
	t.Setenv("SPEECHACE_API_KEY", "")

	analyzer, status := configuredPronunciationAnalyzer()

	if analyzer != nil {
		t.Fatal("expected analyzer to be disabled")
	}
	if status == nil || status.Status != pronunciationStatusDisabled {
		t.Fatalf("unexpected status: %#v", status)
	}
}
