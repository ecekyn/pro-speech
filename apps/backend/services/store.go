package services

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/pro-speech/backend/models"
)

type DailyStore struct {
	mu       sync.Mutex
	path     string
	sessions []models.ConversationSession
}

type storedData struct {
	Sessions []models.ConversationSession `json:"sessions"`
}

var (
	defaultStore     *DailyStore
	defaultStoreErr  error
	defaultStoreOnce sync.Once
)

func DefaultStore() (*DailyStore, error) {
	defaultStoreOnce.Do(func() {
		defaultStore, defaultStoreErr = NewDailyStore("")
	})
	return defaultStore, defaultStoreErr
}

func NewDailyStore(path string) (*DailyStore, error) {
	if path == "" {
		path = os.Getenv("PRO_SPEECH_DATA_PATH")
	}
	if path == "" {
		path = "data/pro_speech.json"
	}

	store := &DailyStore{path: path}
	if err := store.load(); err != nil {
		return nil, err
	}

	return store, nil
}

func (s *DailyStore) AddSession(session models.ConversationSession) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range session.Mistakes {
		if session.Mistakes[i].Count == 0 {
			session.Mistakes[i].Count = 1
		}
	}

	s.sessions = append(s.sessions, session)
	sort.SliceStable(s.sessions, func(i, j int) bool {
		return s.sessions[i].StartedAt.Before(s.sessions[j].StartedAt)
	})

	return s.saveLocked()
}

func (s *DailyStore) SessionsForDate(date string) []models.ConversationSession {
	s.mu.Lock()
	defer s.mu.Unlock()

	sessions := make([]models.ConversationSession, 0)
	for _, session := range s.sessions {
		if session.Date == date {
			sessions = append(sessions, session)
		}
	}

	return sessions
}

func (s *DailyStore) DailyReport(date string, now time.Time) models.DailyReport {
	return BuildDailyReport(date, s.SessionsForDate(date), now)
}

func BuildDailyReport(date string, sessions []models.ConversationSession, now time.Time) models.DailyReport {
	sort.SliceStable(sessions, func(i, j int) bool {
		return sessions[i].StartedAt.Before(sessions[j].StartedAt)
	})

	totalSeconds := 0
	totalWords := 0
	aggregated := make(map[string]models.Mistake)

	for _, session := range sessions {
		totalSeconds += session.DurationSeconds
		transcriptForStats := session.TargetTranscript
		if transcriptForStats == "" {
			transcriptForStats = session.Transcript
		}
		totalWords += len(strings.Fields(transcriptForStats))

		for _, mistake := range session.Mistakes {
			key := mistakeKey(mistake)
			if key == "" {
				continue
			}

			count := mistake.Count
			if count == 0 {
				count = 1
			}

			current := aggregated[key]
			if current.Original == "" {
				current = mistake
				current.Count = 0
			}
			current.Count += count
			if current.Reason == "" {
				current.Reason = mistake.Reason
			}
			if current.Category == "" {
				current.Category = mistake.Category
			}
			aggregated[key] = current
		}
	}

	topMistakes := make([]models.Mistake, 0, len(aggregated))
	for _, mistake := range aggregated {
		topMistakes = append(topMistakes, mistake)
	}
	sort.SliceStable(topMistakes, func(i, j int) bool {
		if topMistakes[i].Count == topMistakes[j].Count {
			return strings.ToLower(topMistakes[i].Original) < strings.ToLower(topMistakes[j].Original)
		}
		return topMistakes[i].Count > topMistakes[j].Count
	})
	if len(topMistakes) > 3 {
		topMistakes = topMistakes[:3]
	}

	return models.DailyReport{
		Date:              date,
		GeneratedAt:       now.UTC(),
		SessionCount:      len(sessions),
		RecordingSeconds:  totalSeconds,
		TranscriptMinutes: estimatedTranscriptMinutes(totalWords),
		TopMistakes:       topMistakes,
		Summary:           dailySummary(len(sessions), topMistakes),
	}
}

func (s *DailyStore) load() error {
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return nil
	}

	var stored storedData
	if err := json.Unmarshal(data, &stored); err != nil {
		return err
	}
	s.sessions = stored.Sessions

	return nil
}

func (s *DailyStore) saveLocked() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(storedData{Sessions: s.sessions}, "", "  ")
	if err != nil {
		return err
	}

	tmpPath := s.path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o600); err != nil {
		return err
	}

	return os.Rename(tmpPath, s.path)
}

func dailySummary(sessionCount int, topMistakes []models.Mistake) string {
	if sessionCount == 0 {
		return "No conversations have been analyzed for this day yet."
	}
	if len(topMistakes) == 0 {
		return "No recurring speaking mistakes were found in today's analyzed conversations."
	}

	return "Your most common speaking pattern today was \"" + topMistakes[0].Original + "\". Review the top mistakes and try the corrected phrasing tomorrow."
}

func estimatedTranscriptMinutes(wordCount int) int {
	if wordCount == 0 {
		return 0
	}

	minutes := wordCount / 150
	if wordCount%150 != 0 {
		minutes++
	}
	return minutes
}

func mistakeKey(mistake models.Mistake) string {
	original := normalizeForKey(mistake.Original)
	correction := normalizeForKey(mistake.Correction)
	category := normalizeForKey(mistake.Category)
	if original == "" && correction == "" {
		return ""
	}

	return original + "|" + correction + "|" + category
}

func normalizeForKey(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return ""
	}

	var builder strings.Builder
	lastWasSpace := false
	for _, r := range value {
		if unicode.IsSpace(r) {
			if !lastWasSpace {
				builder.WriteRune(' ')
			}
			lastWasSpace = true
			continue
		}

		builder.WriteRune(r)
		lastWasSpace = false
	}

	return strings.TrimSpace(builder.String())
}
