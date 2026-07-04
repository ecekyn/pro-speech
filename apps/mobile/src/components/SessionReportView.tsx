import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ConversationSession } from '../services/api';
import { Divider, MistakeList, SectionHeader, TranscriptBlock } from './primitives';
import { colors, spacing } from '../theme';
import { formatClock, formatPercent } from '../utils/format';

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
  const voiceMatchText = session.voice_match
    ? formatVoiceMatch(session.voice_match)
    : 'Voice match: unavailable';

  return (
    <View style={styles.section}>
      <View>
        <SectionHeader
          title="Latest session"
          badge={`${session.mistakes.length} found`}
          badgeTone="info"
        />
        <Text style={styles.sessionMeta}>
          {formatClock(session.started_at)} - {formatClock(session.ended_at)}
        </Text>
      </View>

      <Divider />

      <View style={styles.cluster}>
        <View>
          <Text style={styles.voiceMatch}>{voiceMatchText}</Text>
          {session.speaker_notice ? (
            <Text style={styles.speakerNotice}>{session.speaker_notice}</Text>
          ) : null}
        </View>

        <Text style={styles.summary}>{session.summary}</Text>

        <View>
          <Text style={styles.subheading}>Mistakes</Text>
          <MistakeList
            mistakes={session.mistakes}
            emptyTitle="No mistakes found"
            emptyText={`No speech-specific English mistakes were found for ${analyzedSpeaker}.`}
          />
        </View>
      </View>

      <View style={styles.cluster}>
        <TranscriptBlock
          label="Analyzed speech"
          text={
            targetTranscript || 'No speech was returned for the analyzed speaker.'
          }
        />

        {hasFullConversationTranscript ? (
          <TranscriptBlock
            label="Full conversation transcript"
            text={
              session.transcript ||
              'No full transcript was returned for this recording.'
            }
          />
        ) : null}
      </View>
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

const styles = StyleSheet.create({
  section: {
    gap: spacing.lg,
  },
  cluster: {
    gap: spacing.md,
  },
  sessionMeta: {
    color: colors.inkFaint,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  voiceMatch: {
    color: colors.tealDeep,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  speakerNotice: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  summary: {
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  subheading: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
});
