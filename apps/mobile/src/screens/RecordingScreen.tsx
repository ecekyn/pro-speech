import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import {
  ConversationSession,
  DailyReport,
  VoiceProfileStatus,
  createAudioSession,
  enrollVoiceProfile,
  getDailyReport,
  getSessions,
  getVoiceProfile,
} from '../services/api';
import { ReportView } from '../components/ReportView';
import { SessionReportView } from '../components/SessionReportView';
import {
  CaptureHub,
  Divider,
  GradientBackdrop,
  InfoBanner,
  ScreenIntro,
  StatStrip,
  TappableRow,
  TimelineStep,
  Tone,
} from '../components/primitives';
import { colors, glass, gradients, radii, spacing } from '../theme';
import { requestMicrophonePermission } from '../utils/audioPermissions';
import { formatDuration } from '../utils/format';

const REPORT_HOUR = 20;
type AppTab = 'record' | 'insights' | 'voice';

export function RecordingScreen({
  initialVoiceProfile = null,
}: {
  initialVoiceProfile?: VoiceProfileStatus | null;
}) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<AppTab>('record');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isEnrollingVoice, setIsEnrollingVoice] = useState(false);
  const [voiceEnrollSeconds, setVoiceEnrollSeconds] = useState(0);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfileStatus | null>(
    initialVoiceProfile,
  );
  const [latestSession, setLatestSession] =
    useState<ConversationSession | null>(null);
  const [now, setNow] = useState(new Date());

  const startedAtRef = useRef<Date | null>(null);
  const voiceEnrollmentStartedAtRef = useRef<Date | null>(null);
  const lastAutoRefreshDateRef = useRef<string | null>(null);

  const today = useMemo(() => getLocalDateKey(now), [now]);
  const reportUnlocked = now.getHours() >= REPORT_HOUR;

  const loadReport = useCallback(async (date: string) => {
    setIsLoadingReport(true);
    try {
      const [report, sessions] = await Promise.all([
        getDailyReport(date),
        getSessions(date),
      ]);
      setDailyReport(report);
      setLatestSession(sessions[sessions.length - 1] ?? null);
    } catch (error: any) {
      Alert.alert('Report Error', error.message || 'Failed to load report');
    } finally {
      setIsLoadingReport(false);
    }
  }, []);

  const loadVoiceProfile = useCallback(async () => {
    try {
      setVoiceProfile(await getVoiceProfile());
    } catch (error: any) {
      Alert.alert(
        'Voice Profile Error',
        error.message || 'Failed to load voice profile',
      );
    }
  }, []);

  useEffect(() => {
    loadReport(today);
  }, [loadReport, today]);

  useEffect(() => {
    loadVoiceProfile();
  }, [loadVoiceProfile]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!reportUnlocked || lastAutoRefreshDateRef.current === today) {
      return;
    }

    lastAutoRefreshDateRef.current = today;
    loadReport(today);
  }, [loadReport, reportUnlocked, today]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        const activeDate = getLocalDateKey(new Date());
        setNow(new Date());
        loadReport(activeDate);
      }
    });

    return () => subscription.remove();
  }, [loadReport]);

  const onStartRecord = async () => {
    if (isUploading || isSavingVoice || isEnrollingVoice) {
      return;
    }

    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      Alert.alert('Microphone Required', 'Microphone access is required.');
      return;
    }

    try {
      setLatestSession(null);
      setRecordSeconds(0);
      const startedAt = new Date();
      await AudioRecorderPlayer.startRecorder();
      AudioRecorderPlayer.addRecordBackListener(event => {
        setRecordSeconds(Math.floor(event.currentPosition / 1000));
      });
      startedAtRef.current = startedAt;
      setIsRecording(true);
    } catch {
      Alert.alert('Recording Error', 'Failed to start recording.');
    }
  };

  const onStopRecord = async () => {
    const endedAt = new Date();
    const startedAt = startedAtRef.current || endedAt;
    let audioPath = '';

    try {
      audioPath = await AudioRecorderPlayer.stopRecorder();
      AudioRecorderPlayer.removeRecordBackListener();
      setIsRecording(false);
    } catch {
      Alert.alert('Recording Error', 'Failed to stop recording.');
      return;
    }

    const durationSeconds = Math.max(
      1,
      Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    );

    setIsUploading(true);
    try {
      const response = await createAudioSession(audioPath, {
        date: getLocalDateKey(startedAt),
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSeconds,
      });
      setLatestSession(response.session);
      setDailyReport(response.daily_report);
      setNow(new Date());
      setActiveTab('insights');
    } catch (error: any) {
      Alert.alert(
        'Analysis Error',
        error.message || 'Failed to analyze audio.',
      );
    } finally {
      setIsUploading(false);
      setRecordSeconds(0);
      startedAtRef.current = null;
    }
  };

  const onStartVoiceEnrollment = async () => {
    if (isRecording || isUploading || isSavingVoice) {
      return;
    }

    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      Alert.alert('Microphone Required', 'Microphone access is required.');
      return;
    }

    try {
      setVoiceEnrollSeconds(0);
      voiceEnrollmentStartedAtRef.current = new Date();
      await AudioRecorderPlayer.startRecorder();
      AudioRecorderPlayer.addRecordBackListener(event => {
        setVoiceEnrollSeconds(Math.floor(event.currentPosition / 1000));
      });
      setIsEnrollingVoice(true);
    } catch {
      Alert.alert('Voice Profile Error', 'Failed to start voice enrollment.');
    }
  };

  const onStopVoiceEnrollment = async () => {
    let audioPath = '';

    try {
      audioPath = await AudioRecorderPlayer.stopRecorder();
      AudioRecorderPlayer.removeRecordBackListener();
      setIsEnrollingVoice(false);
    } catch {
      Alert.alert('Voice Profile Error', 'Failed to stop voice enrollment.');
      return;
    }

    setIsSavingVoice(true);
    try {
      const status = await enrollVoiceProfile(audioPath);
      setVoiceProfile(status);
      setActiveTab('voice');
      Alert.alert(
        'Voice Profile Saved',
        'Future reports will try to match your enrolled voice before analyzing a speaker.',
      );
    } catch (error: any) {
      Alert.alert(
        'Voice Profile Error',
        error.message || 'Failed to save voice profile.',
      );
    } finally {
      setIsSavingVoice(false);
      setVoiceEnrollSeconds(0);
      voiceEnrollmentStartedAtRef.current = null;
    }
  };

  const sessionCount = dailyReport?.session_count ?? 0;
  const transcriptMinutes = dailyReport?.transcript_minutes ?? 0;
  const mistakeCount = dailyReport?.top_mistakes.length ?? 0;
  const captureState = isRecording
    ? 'Recording'
    : isUploading
    ? 'Analyzing'
    : 'Ready';
  const captureTone: Tone = isRecording
    ? 'live'
    : isUploading
    ? 'busy'
    : 'neutral';

  return (
    <View style={styles.root}>
      <GradientBackdrop />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + 128,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingReport}
            onRefresh={() => loadReport(today)}
            tintColor={colors.indigo}
            colors={[colors.indigo]}
          />
        }
      >
        <AppHeader now={now} />

        {activeTab === 'record' ? (
          <RecordTab
            captureState={captureState}
            captureTone={captureTone}
            isEnrollingVoice={isEnrollingVoice}
            isRecording={isRecording}
            isSavingVoice={isSavingVoice}
            isUploading={isUploading}
            latestSession={latestSession}
            onManageVoice={() => setActiveTab('voice')}
            onRecordPress={isRecording ? onStopRecord : onStartRecord}
            recordSeconds={recordSeconds}
            sessionCount={sessionCount}
            transcriptMinutes={transcriptMinutes}
            mistakeCount={mistakeCount}
            voiceProfile={voiceProfile}
          />
        ) : null}

        {activeTab === 'insights' ? (
          <InsightsTab
            dailyReport={dailyReport}
            isUploading={isUploading}
            latestSession={latestSession}
            reportUnlocked={reportUnlocked}
          />
        ) : null}

        {activeTab === 'voice' ? (
          <VoiceTab
            isEnrollingVoice={isEnrollingVoice}
            isSavingVoice={isSavingVoice}
            onPress={
              isEnrollingVoice ? onStopVoiceEnrollment : onStartVoiceEnrollment
            }
            voiceEnrollSeconds={voiceEnrollSeconds}
            voiceProfile={voiceProfile}
          />
        ) : null}
      </ScrollView>

      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

function AppHeader({ now }: { now: Date }) {
  return (
    <View style={styles.header}>
      <Text style={styles.appName}>Pro Speech</Text>
      <Text style={styles.title}>Today</Text>
      <Text style={styles.subtitle}>{formatDisplayDate(now)}</Text>
    </View>
  );
}

function RecordTab({
  captureState,
  captureTone,
  isEnrollingVoice,
  isRecording,
  isSavingVoice,
  isUploading,
  latestSession,
  mistakeCount,
  onManageVoice,
  onRecordPress,
  recordSeconds,
  sessionCount,
  transcriptMinutes,
  voiceProfile,
}: {
  captureState: string;
  captureTone: Tone;
  isEnrollingVoice: boolean;
  isRecording: boolean;
  isSavingVoice: boolean;
  isUploading: boolean;
  latestSession: ConversationSession | null;
  mistakeCount: number;
  onManageVoice: () => void;
  onRecordPress: () => void;
  recordSeconds: number;
  sessionCount: number;
  transcriptMinutes: number;
  voiceProfile: VoiceProfileStatus | null;
}) {
  const voiceReady = Boolean(voiceProfile?.enrolled);

  return (
    <View style={styles.tabStack}>
      <ScreenIntro
        title="Record"
        subtitle="Capture a conversation and review the analysis as soon as it finishes."
      />

      {!voiceReady ? (
        <TappableRow
          title="Voice profile not set"
          subtitle="Create a profile before long conversations."
          dotTone="warning"
          onPress={onManageVoice}
        />
      ) : null}

      <CaptureHub
        eyebrow="Capture"
        title="Conversation"
        stateLabel={captureState}
        stateTone={captureTone}
        timerSeconds={recordSeconds}
        timerCaption={
          isRecording ? 'Listening' : isUploading ? 'Processing audio' : 'Idle'
        }
        isActive={isRecording}
        activeActionLabel="Stop and analyze"
        idleActionLabel="Start recording"
        onPress={onRecordPress}
        disabled={isUploading || isSavingVoice || isEnrollingVoice}
        busy={isUploading}
        busyText="Preparing your latest analysis"
      />

      <View style={styles.statsSection}>
        <Text style={styles.statsSectionLabel}>Today</Text>
        <StatStrip
          items={[
            { label: 'Sessions', value: String(sessionCount), tone: 'indigo' },
            {
              label: 'Minutes',
              value: String(transcriptMinutes),
              tone: 'teal',
            },
            { label: 'Patterns', value: String(mistakeCount), tone: 'amber' },
          ]}
        />
        <Divider />
        <Text style={styles.helperText}>
          {latestSession
            ? 'Latest analysis is available in Insights.'
            : 'Start a recording to create your first session analysis.'}
        </Text>
      </View>
    </View>
  );
}

function InsightsTab({
  dailyReport,
  isUploading,
  latestSession,
  reportUnlocked,
}: {
  dailyReport: DailyReport | null;
  isUploading: boolean;
  latestSession: ConversationSession | null;
  reportUnlocked: boolean;
}) {
  return (
    <View style={styles.tabStack}>
      <ScreenIntro
        title="Insights"
        subtitle="Review the latest session and track the patterns building through the day."
      />

      {isUploading ? (
        <InfoBanner
          tone="busy"
          loading
          title="Analyzing audio"
          text="The session report will appear here when processing finishes."
        />
      ) : latestSession ? (
        <SessionReportView session={latestSession} />
      ) : (
        <InfoBanner
          title="No session analysis yet"
          text="Record a conversation to see speaker filtering, mistakes, and transcript details."
        />
      )}

      <Divider />

      <ReportView report={dailyReport} reportUnlocked={reportUnlocked} />
    </View>
  );
}

function VoiceTab({
  isEnrollingVoice,
  isSavingVoice,
  onPress,
  voiceEnrollSeconds,
  voiceProfile,
}: {
  isEnrollingVoice: boolean;
  isSavingVoice: boolean;
  onPress: () => void;
  voiceEnrollSeconds: number;
  voiceProfile: VoiceProfileStatus | null;
}) {
  const voiceReady = Boolean(voiceProfile?.enrolled);

  return (
    <View style={styles.tabStack}>
      <ScreenIntro
        title="Voice"
        subtitle="Create and update the profile used to ignore other speakers in your conversations."
      />

      <TappableRow
        title={voiceReady ? 'Voice profile active' : 'Voice profile not set'}
        subtitle={
          voiceReady
            ? profileSampleText(voiceProfile)
            : 'Create a profile before long conversations.'
        }
        dotTone={voiceReady ? 'success' : 'warning'}
      />

      <CaptureHub
        eyebrow="Profile"
        title="Voice profile"
        description="A short voice sample helps Pro Speech analyze only your speech when a conversation has multiple people."
        stateLabel={isEnrollingVoice ? 'Recording' : 'Ready'}
        stateTone={isEnrollingVoice ? 'live' : 'neutral'}
        timerSeconds={voiceEnrollSeconds}
        timerCaption={isEnrollingVoice ? 'Recording sample' : 'Idle'}
        isActive={isEnrollingVoice}
        activeActionLabel={`Stop ${formatDuration(voiceEnrollSeconds)}`}
        idleActionLabel={voiceReady ? 'Update voice' : 'Set voice'}
        onPress={onPress}
        disabled={isSavingVoice}
        busy={isSavingVoice}
        busyText="Saving voice sample"
      />

      <View style={styles.statsSection}>
        <Text style={styles.statsSectionLabel}>How analysis works</Text>
        <TimelineStep
          index={1}
          title="Enroll your voice"
          text="Record a sample so the backend has a reference."
        />
        <TimelineStep
          index={2}
          title="Record conversations"
          text="Sessions can include multiple speakers."
        />
        <TimelineStep
          index={3}
          title="Filter and report"
          text="Only confident matches are used for your mistake report."
          isLast
        />
      </View>
    </View>
  );
}

function TabBar({
  activeTab,
  onTabChange,
  bottomInset,
}: {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  bottomInset: number;
}) {
  return (
    <View style={[styles.tabBar, { bottom: bottomInset + spacing.lg }]}>
      <TabButton
        active={activeTab === 'record'}
        label="Record"
        icon={<RecordIcon active={activeTab === 'record'} />}
        onPress={() => onTabChange('record')}
      />
      <TabButton
        active={activeTab === 'insights'}
        label="Insights"
        icon={<InsightsIcon active={activeTab === 'insights'} />}
        onPress={() => onTabChange('insights')}
      />
      <TabButton
        active={activeTab === 'voice'}
        label="Voice"
        icon={<VoiceIcon active={activeTab === 'voice'} />}
        onPress={() => onTabChange('voice')}
      />
    </View>
  );
}

function TabButton({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabButton,
        active && styles.tabButtonActive,
        pressed && styles.tabButtonPressed,
      ]}
    >
      <View style={styles.tabIconSlot}>{icon}</View>
      <Text
        style={[styles.tabButtonText, active && styles.tabButtonTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function RecordIcon({ active }: { active: boolean }) {
  return (
    <View
      style={[
        styles.tabRecordDot,
        { backgroundColor: active ? colors.onAccent : colors.inkFaint },
      ]}
    />
  );
}

function InsightsIcon({ active }: { active: boolean }) {
  const barColor = active ? colors.onAccent : colors.inkFaint;
  const heights = [8, 15, 11];
  return (
    <View style={styles.tabBarsRow}>
      {heights.map((height, index) => (
        <View
          key={index}
          style={[styles.tabInsightsBar, { height, backgroundColor: barColor }]}
        />
      ))}
    </View>
  );
}

function VoiceIcon({ active }: { active: boolean }) {
  const barColor = active ? colors.onAccent : colors.inkFaint;
  const heights = [6, 12, 16, 10, 5];
  return (
    <View style={styles.tabBarsRow}>
      {heights.map((height, index) => (
        <View
          key={index}
          style={[styles.tabWaveBar, { height, backgroundColor: barColor }]}
        />
      ))}
    </View>
  );
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date: Date) {
  return date.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function profileSampleText(voiceProfile: VoiceProfileStatus | null) {
  const sampleCount = voiceProfile?.sample_count || 1;

  return `${sampleCount} voice sample${sampleCount === 1 ? '' : 's'} saved`;
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
    paddingHorizontal: spacing.xl,
  },
  header: {
    marginBottom: spacing.xxl,
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
    marginTop: 3,
  },
  tabStack: {
    gap: spacing.xxl,
  },
  statsSection: {
    gap: spacing.sm,
  },
  statsSectionLabel: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  helperText: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  tabBar: {
    ...glass.floating,
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    padding: 6,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flex: 1,
    gap: 4,
    minHeight: 56,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabButtonActive: {
    experimental_backgroundImage: gradients.primary,
  },
  tabButtonPressed: {
    opacity: 0.8,
  },
  tabIconSlot: {
    alignItems: 'center',
    height: 16,
    justifyContent: 'center',
  },
  tabButtonText: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '800',
  },
  tabButtonTextActive: {
    color: colors.onAccent,
  },
  tabRecordDot: {
    borderRadius: radii.pill,
    height: 12,
    width: 12,
  },
  tabBarsRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 3,
    height: 16,
  },
  tabInsightsBar: {
    borderRadius: 2,
    width: 4,
  },
  tabWaveBar: {
    borderRadius: 2,
    width: 3,
  },
});
