package services

import "testing"

func TestBuildSpeakerTranscriptNormalizesSpeakerLabels(t *testing.T) {
	chunks := []speakerChunk{
		{Speaker: normalizeSpeakerString("SPEAKER_00"), Text: "I seen him yesterday."},
		{Speaker: normalizeSpeakerString("SPEAKER_00"), Text: "Then I called back."},
		{Speaker: normalizeSpeakerString("speaker_01"), Text: "You mean you saw him?"},
	}

	transcript, speakers := buildSpeakerTranscript(chunks)

	wantTranscript := "Speaker 0: I seen him yesterday. Then I called back.\nSpeaker 1: You mean you saw him?"
	if transcript != wantTranscript {
		t.Fatalf("unexpected speaker transcript:\nwant: %q\ngot:  %q", wantTranscript, transcript)
	}
	if len(speakers) != 2 || speakers[0] != "Speaker 0" || speakers[1] != "Speaker 1" {
		t.Fatalf("unexpected speakers: %#v", speakers)
	}
}
