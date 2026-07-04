package services

import "testing"

func TestSelectTargetSpeechFiltersOnlyRequestedSpeaker(t *testing.T) {
	transcript := `Speaker 0: I seen him yesterday.
Speaker 1: You mean you saw him?
Speaker 0: Yeah, I saw him.`

	selected := selectTargetSpeech(transcript, AnalysisOptions{
		TargetSpeaker:          "Speaker 0",
		SpeakerLabelsAvailable: true,
	})

	if selected.TargetSpeaker != "Speaker 0" {
		t.Fatalf("expected target speaker Speaker 0, got %q", selected.TargetSpeaker)
	}
	if selected.TargetTranscript != "I seen him yesterday. Yeah, I saw him." {
		t.Fatalf("unexpected target transcript: %q", selected.TargetTranscript)
	}
	if selected.SpeakerMode != speakerModeDiarizedTarget {
		t.Fatalf("expected diarized speaker mode, got %q", selected.SpeakerMode)
	}
}

func TestSelectTargetSpeechIgnoresOtherSpeaker(t *testing.T) {
	transcript := `Speaker 0: That is fine.
Speaker 1: I seen him yesterday.`

	selected := selectTargetSpeech(transcript, AnalysisOptions{
		TargetSpeaker:          "Speaker 0",
		SpeakerLabelsAvailable: true,
	})

	if selected.TargetTranscript != "That is fine." {
		t.Fatalf("unexpected target transcript: %q", selected.TargetTranscript)
	}
}

func TestSelectTargetSpeechFallsBackToSingleSpeakerAssumption(t *testing.T) {
	transcript := "I seen him yesterday and, uh, I was like not ready."

	selected := selectTargetSpeech(transcript, AnalysisOptions{})

	if selected.TargetSpeaker != "App user" {
		t.Fatalf("expected app user fallback, got %q", selected.TargetSpeaker)
	}
	if selected.TargetTranscript != transcript {
		t.Fatalf("expected full transcript fallback, got %q", selected.TargetTranscript)
	}
	if selected.SpeakerMode != speakerModeSingleSpeakerGuess {
		t.Fatalf("expected single-speaker mode, got %q", selected.SpeakerMode)
	}
}
