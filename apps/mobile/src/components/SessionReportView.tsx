import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ConversationSession, Mistake } from '../services/api';
import { colors, shadows } from '../theme';

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
  const voiceMatchText = session.voice_match
    ? formatVoiceMatch(session.voice_match)
    : 'Voice match: unavailable';

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View>
          <Text style={styles.sectionTitle}>Latest analysis</Text>
          <Text style={styles.sessionMeta}>
            {formatClock(session.started_at)} - {formatClock(session.ended_at)}
          </Text>
        </View>
        <View style={styles.resultBadge}>
          <Text style={styles.resultBadgeText}>
            {session.mistakes.length} found
          </Text>
        </View>
      </View>

      <View style={styles.speakerPanel}>
        <View style={styles.speakerMetric}>
          <Text style={styles.speakerMetricLabel}>Analyzed</Text>
          <Text style={styles.speakerMetricValue}>{analyzedSpeaker}</Text>
        </View>
        <View style={styles.speakerMetric}>
          <Text style={styles.speakerMetricLabel}>Ignored</Text>
          <Text style={styles.speakerMetricValue}>
            {ignoredSpeakerCount}{' '}
            {ignoredSpeakerCount === 1 ? 'speaker' : 'speakers'}
          </Text>
        </View>
      </View>

      <View style={styles.voiceMatchPanel}>
        <Text style={styles.voiceMatch}>{voiceMatchText}</Text>
        {session.speaker_notice ? (
          <Text style={styles.speakerNotice}>{session.speaker_notice}</Text>
        ) : null}
      </View>

      <Text style={styles.summary}>{session.summary}</Text>

      <Text style={styles.subheading}>Mistakes</Text>
      {session.mistakes.length > 0 ? (
        session.mistakes.map((mistake, index) => (
          <MistakeCard key={`${mistake.original}-${index}`} mistake={mistake} />
        ))
      ) : (
        <View style={styles.noMistakesPanel}>
          <Text style={styles.noMistakesTitle}>No mistakes found</Text>
          <Text style={styles.noMistakes}>
            {`No speech-specific English mistakes were found for ${analyzedSpeaker}.`}
          </Text>
        </View>
      )}

      <Text style={styles.subheading}>Analyzed speech</Text>
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
          <Text style={styles.category}>{mistake.category || 'Mistake'}</Text>
          {mistake.speaker ? (
            <Text style={styles.mistakeSpeaker}>{mistake.speaker}</Text>
          ) : null}
        </View>
        <Text style={styles.mistakeCount}>{mistake.count || 1}x</Text>
      </View>
      <View style={styles.phraseBlock}>
        <Text style={styles.phraseLabel}>Heard</Text>
        <Text style={styles.original}>{mistake.original}</Text>
      </View>
      <View style={[styles.phraseBlock, styles.phraseBlockCorrect]}>
        <Text style={styles.phraseLabel}>Say</Text>
        <Text style={styles.correction}>{mistake.correction}</Text>
      </View>
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
    marginBottom: 16,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sessionMeta: {
    color: colors.inkSubtle,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  resultBadge: {
    backgroundColor: colors.tealSoft,
    borderColor: colors.glassStroke,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  resultBadgeText: {
    color: colors.tealDark,
    fontSize: 12,
    fontWeight: '800',
  },
  summary: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  subheading: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 4,
  },
  speakerPanel: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  speakerMetric: {
    backgroundColor: colors.surface,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 12,
    ...shadows.card,
  },
  speakerMetricLabel: {
    color: colors.inkSubtle,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  speakerMetricValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  voiceMatchPanel: {
    backgroundColor: colors.blueSoft,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  speakerNotice: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  voiceMatch: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  mistakeCard: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
    ...shadows.card,
  },
  mistakeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  category: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  mistakeSpeaker: {
    color: colors.inkSubtle,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  mistakeCount: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: '800',
  },
  phraseBlock: {
    backgroundColor: colors.redSoft,
    borderRadius: 8,
    marginBottom: 8,
    padding: 10,
  },
  phraseBlockCorrect: {
    backgroundColor: colors.greenSoft,
  },
  phraseLabel: {
    color: colors.inkSubtle,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  original: {
    color: colors.red,
    fontSize: 15,
    fontWeight: '800',
    textDecorationLine: 'line-through',
  },
  correction: {
    color: colors.green,
    fontSize: 15,
    fontWeight: '800',
  },
  reason: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  noMistakesPanel: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  noMistakesTitle: {
    color: colors.green,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  noMistakes: {
    color: colors.green,
    fontSize: 14,
    lineHeight: 20,
  },
  transcript: {
    backgroundColor: colors.surface,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.slate,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
    padding: 12,
    ...shadows.card,
  },
});
