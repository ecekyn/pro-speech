package models

import "time"

type Mistake struct {
	Original   string `json:"original"`
	Correction string `json:"correction"`
	Reason     string `json:"reason"`
	Category   string `json:"category,omitempty"`
	Count      int    `json:"count,omitempty"`
	Speaker    string `json:"speaker,omitempty"`
}

type AnalysisReport struct {
	Transcript       string      `json:"transcript"`
	TargetTranscript string      `json:"target_transcript,omitempty"`
	TargetSpeaker    string      `json:"target_speaker,omitempty"`
	SpeakerMode      string      `json:"speaker_mode,omitempty"`
	SpeakerNotice    string      `json:"speaker_notice,omitempty"`
	Speakers         []string    `json:"speakers,omitempty"`
	VoiceMatch       *VoiceMatch `json:"voice_match,omitempty"`
	Mistakes         []Mistake   `json:"mistakes"`
	Summary          string      `json:"summary"`
}

type TranscriptionResult struct {
	Transcript        string           `json:"transcript"`
	SpeakerTranscript string           `json:"speaker_transcript,omitempty"`
	HasSpeakerLabels  bool             `json:"has_speaker_labels"`
	Speakers          []string         `json:"speakers,omitempty"`
	Segments          []SpeakerSegment `json:"segments,omitempty"`
}

type ConversationSession struct {
	ID               string      `json:"id"`
	Date             string      `json:"date"`
	StartedAt        time.Time   `json:"started_at"`
	EndedAt          time.Time   `json:"ended_at"`
	DurationSeconds  int         `json:"duration_seconds"`
	Transcript       string      `json:"transcript"`
	TargetTranscript string      `json:"target_transcript,omitempty"`
	TargetSpeaker    string      `json:"target_speaker,omitempty"`
	SpeakerMode      string      `json:"speaker_mode,omitempty"`
	SpeakerNotice    string      `json:"speaker_notice,omitempty"`
	Speakers         []string    `json:"speakers,omitempty"`
	VoiceMatch       *VoiceMatch `json:"voice_match,omitempty"`
	Mistakes         []Mistake   `json:"mistakes"`
	Summary          string      `json:"summary"`
}

type SpeakerSegment struct {
	Speaker      string  `json:"speaker"`
	Text         string  `json:"text"`
	StartSeconds float64 `json:"start_seconds"`
	EndSeconds   float64 `json:"end_seconds"`
}

type SpeakerScore struct {
	Speaker string  `json:"speaker"`
	Score   float64 `json:"score"`
}

type VoiceMatch struct {
	Status     string         `json:"status"`
	Speaker    string         `json:"speaker,omitempty"`
	Confidence float64        `json:"confidence,omitempty"`
	Scores     []SpeakerScore `json:"scores,omitempty"`
	Notice     string         `json:"notice,omitempty"`
}

type VoiceProfileStatus struct {
	Enrolled    bool      `json:"enrolled"`
	CreatedAt   time.Time `json:"created_at,omitempty"`
	UpdatedAt   time.Time `json:"updated_at,omitempty"`
	SampleCount int       `json:"sample_count,omitempty"`
}

type DailyReport struct {
	Date              string    `json:"date"`
	GeneratedAt       time.Time `json:"generated_at"`
	SessionCount      int       `json:"session_count"`
	RecordingSeconds  int       `json:"recording_seconds"`
	TranscriptMinutes int       `json:"transcript_minutes"`
	TopMistakes       []Mistake `json:"top_mistakes"`
	Summary           string    `json:"summary"`
}

type SessionAnalysisResponse struct {
	Session     ConversationSession `json:"session"`
	DailyReport DailyReport         `json:"daily_report"`
}
