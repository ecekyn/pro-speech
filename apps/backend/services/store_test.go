package services

import (
	"testing"
	"time"

	"github.com/pro-speech/backend/models"
)

func TestBuildDailyReportRanksTopThreeMistakes(t *testing.T) {
	now := time.Date(2026, 7, 4, 20, 0, 0, 0, time.UTC)
	sessions := []models.ConversationSession{
		{
			Date:            "2026-07-04",
			StartedAt:       now.Add(-2 * time.Hour),
			DurationSeconds: 120,
			Transcript:      "I go to store and he do it. I go to store.",
			Mistakes: []models.Mistake{
				{Original: "I go to store", Correction: "I go to the store", Reason: "Missing article.", Category: "grammar", Count: 2},
				{Original: "he do", Correction: "he does", Reason: "Subject-verb agreement.", Category: "grammar"},
			},
		},
		{
			Date:            "2026-07-04",
			StartedAt:       now.Add(-1 * time.Hour),
			DurationSeconds: 180,
			Transcript:      "I am agree. I go to store.",
			Mistakes: []models.Mistake{
				{Original: "I go to store", Correction: "I go to the store", Reason: "Missing article.", Category: "grammar"},
				{Original: "I am agree", Correction: "I agree", Reason: "Unnecessary be verb.", Category: "fluency", Count: 4},
				{Original: "less people", Correction: "fewer people", Reason: "Use fewer for countable nouns.", Category: "word_choice"},
				{Original: "discuss about", Correction: "discuss", Reason: "Discuss does not take about.", Category: "grammar"},
			},
		},
	}

	report := BuildDailyReport("2026-07-04", sessions, now)

	if report.SessionCount != 2 {
		t.Fatalf("expected 2 sessions, got %d", report.SessionCount)
	}
	if report.RecordingSeconds != 300 {
		t.Fatalf("expected 300 recording seconds, got %d", report.RecordingSeconds)
	}
	if len(report.TopMistakes) != 3 {
		t.Fatalf("expected 3 top mistakes, got %d", len(report.TopMistakes))
	}

	want := []struct {
		original string
		count    int
	}{
		{"I am agree", 4},
		{"I go to store", 3},
		{"discuss about", 1},
	}

	for i, expected := range want {
		if report.TopMistakes[i].Original != expected.original {
			t.Fatalf("mistake %d original: expected %q, got %q", i, expected.original, report.TopMistakes[i].Original)
		}
		if report.TopMistakes[i].Count != expected.count {
			t.Fatalf("mistake %d count: expected %d, got %d", i, expected.count, report.TopMistakes[i].Count)
		}
	}
}

func TestBuildDailyReportHandlesEmptyDay(t *testing.T) {
	report := BuildDailyReport("2026-07-04", nil, time.Now())

	if report.SessionCount != 0 {
		t.Fatalf("expected no sessions, got %d", report.SessionCount)
	}
	if len(report.TopMistakes) != 0 {
		t.Fatalf("expected no mistakes, got %d", len(report.TopMistakes))
	}
	if report.Summary == "" {
		t.Fatal("expected a useful empty-day summary")
	}
}
