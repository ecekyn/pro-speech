package services

import "testing"

func TestMatchSpeakerScoresChoosesConfidentVoiceMatch(t *testing.T) {
	profile := audioFingerprint{
		RMSMean:          0.08,
		RMSStd:           0.03,
		ZeroCrossingMean: 0.08,
		ZeroCrossingStd:  0.03,
		PitchMean:        145,
		PitchStd:         22,
		VoicedRatio:      0.72,
	}
	candidates := map[string]audioFingerprint{
		"Speaker 0": {
			RMSMean:          0.04,
			RMSStd:           0.01,
			ZeroCrossingMean: 0.16,
			ZeroCrossingStd:  0.05,
			PitchMean:        230,
			PitchStd:         50,
			VoicedRatio:      0.42,
		},
		"Speaker 1": profile,
	}

	match := matchSpeakerScores(profile, candidates, 0.78, 0.03)

	if match.Status != voiceMatchStatusMatched {
		t.Fatalf("expected matched status, got %q", match.Status)
	}
	if match.Speaker != "Speaker 1" {
		t.Fatalf("expected Speaker 1, got %q", match.Speaker)
	}
}

func TestMatchSpeakerScoresRejectsSmallMargin(t *testing.T) {
	profile := audioFingerprint{
		RMSMean:          0.08,
		RMSStd:           0.03,
		ZeroCrossingMean: 0.08,
		ZeroCrossingStd:  0.03,
		PitchMean:        145,
		PitchStd:         22,
		VoicedRatio:      0.72,
	}
	candidates := map[string]audioFingerprint{
		"Speaker 0": profile,
		"Speaker 1": profile,
	}

	match := matchSpeakerScores(profile, candidates, 0.78, 0.03)

	if match.Status != voiceMatchStatusNoConfidentMatch {
		t.Fatalf("expected no confident match, got %q", match.Status)
	}
}
