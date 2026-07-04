import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ConversationSession, Mistake } from '../services/api';

interface Props {
  session: ConversationSession;
}

export function SessionReportView({ session }: Props) {
  const analyzedSpeaker =
    session.target_speaker ||
    (session.voice_match?.status === 'matched'
      ? session.voice_match.speaker
      : 'Not identified') ||
    'App user';
  const voiceWasNotIdentified =
    session.speaker_mode === 'voice_profile_no_match';
  const targetTranscript =
    session.target_transcript ||
    (voiceWasNotIdentified ? '' : session.transcript);
  const hasFullConversationTranscript =
    Boolean(session.transcript) &&
    (voiceWasNotIdentified ||
      (Boolean(session.target_transcript) &&
        session.target_transcript !== session.transcript));
  const speakerCount = session.speakers?.length ?? 0;
  const ignoredSpeakerCount = Math.max(0, speakerCount - 1);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View>
          <Text style={styles.sectionTitle}>Latest session report</Text>
          <Text style={styles.sessionMeta}>
            {formatClock(session.started_at)} - {formatClock(session.ended_at)}
          </Text>
        </View>
        <Text style={styles.count}>{session.mistakes.length} found</Text>
      </View>

      <Text style={styles.speakerMeta}>
        Analyzed speaker: {analyzedSpeaker}
        {ignoredSpeakerCount > 0
          ? `, ${ignoredSpeakerCount} other ${
              ignoredSpeakerCount === 1 ? 'speaker' : 'speakers'
            } ignored`
          : ''}
      </Text>
      {session.speaker_notice ? (
        <Text style={styles.speakerNotice}>{session.speaker_notice}</Text>
      ) : null}
      {session.voice_match ? (
        <Text style={styles.voiceMatch}>
          {formatVoiceMatch(session.voice_match)}
        </Text>
      ) : null}

      <Text style={styles.summary}>{session.summary}</Text>

      <Text style={styles.subheading}>Speaking mistakes</Text>
      {session.mistakes.length > 0 ? (
        session.mistakes.map((mistake, index) => (
          <MistakeCard key={`${mistake.original}-${index}`} mistake={mistake} />
        ))
      ) : (
        <Text style={styles.noMistakes}>
          No speech-specific English mistakes were found for {analyzedSpeaker}.
        </Text>
      )}

      <Text style={styles.subheading}>Your speech</Text>
      <Text style={styles.transcript}>
        {targetTranscript || 'No speech was returned for the analyzed speaker.'}
      </Text>

      {hasFullConversationTranscript ? (
        <>
          <Text style={styles.subheading}>Full conversation transcript</Text>
          <Text style={styles.transcript}>
            {session.transcript ||
              'No full transcript was returned for this recording.'}
          </Text>
        </>
      ) : null}
    </View>
  );
}

function formatVoiceMatch(
  voiceMatch: NonNullable<ConversationSession['voice_match']>,
) {
  if (voiceMatch.status === 'matched') {
    return `Voice match: ${voiceMatch.speaker || 'speaker'} (${formatPercent(
      voiceMatch.confidence,
    )})`;
  }
  if (voiceMatch.status === 'not_enrolled') {
    return 'Voice match: no enrolled profile';
  }
  if (voiceMatch.status === 'no_confident_match') {
    return `Voice match: not confident (${formatPercent(
      voiceMatch.confidence,
    )} best match)`;
  }

  return 'Voice match: unavailable';
}

function formatPercent(value?: number) {
  if (typeof value !== 'number') {
    return 'unknown';
  }

  return `${Math.round(value * 100)}%`;
}

function MistakeCard({ mistake }: { mistake: Mistake }) {
  return (
    <View style={styles.mistakeCard}>
      <View style={styles.mistakeHeader}>
        <View>
          <Text style={styles.category}>{mistake.category || 'mistake'}</Text>
          {mistake.speaker ? (
            <Text style={styles.mistakeSpeaker}>{mistake.speaker}</Text>
          ) : null}
        </View>
        <Text style={styles.count}>{mistake.count || 1}x</Text>
      </View>
      <Text style={styles.original}>{mistake.original}</Text>
      <Text style={styles.correction}>Say: {mistake.correction}</Text>
      <Text style={styles.reason}>{mistake.reason}</Text>
    </View>
  );
}

function formatClock(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '700',
  },
  sessionMeta: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  count: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '800',
  },
  summary: {
    color: '#374151',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  subheading: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 4,
  },
  speakerMeta: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginBottom: 6,
  },
  speakerNotice: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  voiceMatch: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 12,
  },
  mistakeCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  mistakeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  category: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  mistakeSpeaker: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  original: {
    color: '#B91C1C',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
    textDecorationLine: 'line-through',
  },
  correction: {
    color: '#166534',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  reason: {
    color: '#4B5563',
    fontSize: 13,
    lineHeight: 19,
  },
  noMistakes: {
    color: '#166534',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  transcript: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
    padding: 12,
  },
});
