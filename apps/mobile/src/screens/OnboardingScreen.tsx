import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import { VoiceProfileStatus, enrollVoiceProfile } from '../services/api';
import {
  CaptureHub,
  Divider,
  GradientBackdrop,
  GlassPanel,
  InfoBanner,
  TimelineStep,
  Tone,
} from '../components/primitives';
import { colors, radii, spacing } from '../theme';
import { requestMicrophonePermission } from '../utils/audioPermissions';

const VOICE_PROFILE_SENTENCES = [
  'Today I will speak clearly and at a steady pace.',
  'The quick brown fox jumps over the calm river.',
  'Every conversation helps me notice patterns in my speech.',
  'I can pause, breathe, and choose my words with confidence.',
];

export function OnboardingScreen({
  onComplete,
}: {
  onComplete: (voiceProfile: VoiceProfileStatus) => void;
}) {
  const insets = useSafeAreaInsets();
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const onStartVoiceSample = async () => {
    if (isSaving || isRecording) {
      return;
    }

    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      Alert.alert('Microphone Required', 'Microphone access is required.');
      return;
    }

    try {
      setRecordSeconds(0);
      await AudioRecorderPlayer.startRecorder();
      AudioRecorderPlayer.addRecordBackListener(event => {
        setRecordSeconds(Math.floor(event.currentPosition / 1000));
      });
      setIsRecording(true);
    } catch {
      Alert.alert('Voice Profile Error', 'Failed to start voice enrollment.');
    }
  };

  const onStopVoiceSample = async () => {
    let audioPath = '';

    try {
      audioPath = await AudioRecorderPlayer.stopRecorder();
      AudioRecorderPlayer.removeRecordBackListener();
      setIsRecording(false);
    } catch {
      Alert.alert('Voice Profile Error', 'Failed to stop voice enrollment.');
      return;
    }

    setIsSaving(true);
    try {
      const voiceProfile = await enrollVoiceProfile(audioPath);
      onComplete(voiceProfile);
    } catch (error: any) {
      Alert.alert(
        'Voice Profile Error',
        error.message || 'Failed to save voice profile.',
      );
    } finally {
      setIsSaving(false);
      setRecordSeconds(0);
    }
  };

  const stateLabel = isSaving ? 'Saving' : isRecording ? 'Recording' : 'Ready';
  const stateTone: Tone = isSaving ? 'busy' : isRecording ? 'live' : 'neutral';

  return (
    <View style={styles.root}>
      <GradientBackdrop />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + spacing.xxxl,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.appName}>Pro Speech</Text>
          <Text style={styles.title}>Set up voice filtering</Text>
          <Text style={styles.subtitle}>
            Read the sentences aloud once so Pro Speech can focus reports on
            your voice.
          </Text>
        </View>

        <GlassPanel>
          <Text style={styles.sectionLabel}>Read aloud</Text>
          <View style={styles.sentenceStack}>
            {VOICE_PROFILE_SENTENCES.map((sentence, index) => (
              <View key={sentence} style={styles.sentenceRow}>
                <View style={styles.sentenceIndex}>
                  <Text style={styles.sentenceIndexText}>{index + 1}</Text>
                </View>
                <Text style={styles.sentenceText}>{sentence}</Text>
              </View>
            ))}
          </View>
          <Divider style={styles.scriptDivider} />
          <Text style={styles.scriptHint}>
            Record in a quiet place and keep a natural speaking pace.
          </Text>
        </GlassPanel>

        <CaptureHub
          eyebrow="Onboarding"
          title="Voice profile"
          description="This sample becomes the reference used to ignore other speakers during conversation analysis."
          stateLabel={stateLabel}
          stateTone={stateTone}
          timerSeconds={recordSeconds}
          timerCaption={isRecording ? 'Reading script' : 'Idle'}
          isActive={isRecording}
          activeActionLabel="Finish sample"
          idleActionLabel="Start voice sample"
          onPress={isRecording ? onStopVoiceSample : onStartVoiceSample}
          disabled={isSaving}
          busy={isSaving}
          busyText="Building voice profile"
        />

        <View style={styles.timelineSection}>
          <Text style={styles.sectionLabel}>How it works</Text>
          <TimelineStep
            index={1}
            title="Create a profile"
            text="Your reading sample produces a voice fingerprint."
          />
          <TimelineStep
            index={2}
            title="Match future recordings"
            text="Conversation sessions are compared with that fingerprint."
          />
          <TimelineStep
            index={3}
            title="Analyze your speech"
            text="Reports use the matched speaker when the app is confident."
            isLast
          />
        </View>

        <InfoBanner
          tone="info"
          text="You can update the voice profile later from the Voice tab."
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EEF2FF',
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  header: {
    marginBottom: spacing.sm,
  },
  appName: {
    color: colors.indigo,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 21,
    marginTop: spacing.sm,
  },
  sectionLabel: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sentenceStack: {
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  sentenceRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
  },
  sentenceIndex: {
    alignItems: 'center',
    backgroundColor: colors.indigoTint,
    borderRadius: radii.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  sentenceIndexText: {
    color: colors.indigoDeep,
    fontSize: 13,
    fontWeight: '800',
  },
  sentenceText: {
    color: colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 25,
  },
  scriptDivider: {
    marginVertical: spacing.lg,
  },
  scriptHint: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  timelineSection: {
    gap: spacing.sm,
  },
});
