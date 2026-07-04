import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  PermissionsAndroid,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { colors, shadows } from '../theme';

const REPORT_HOUR = 20;
type AppTab = 'record' | 'insights' | 'voice';

export function RecordingScreen() {
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
    null,
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View pointerEvents="none" style={styles.backgroundCanvas}>
        <View style={styles.backgroundTop} />
        <View style={styles.backgroundShelf} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingReport}
            onRefresh={() => loadReport(today)}
            tintColor={colors.teal}
            colors={[colors.teal]}
          />
        }
      >
        <AppHeader now={now} reportUnlocked={reportUnlocked} />

        {activeTab === 'record' ? (
          <RecordTab
            captureState={captureState}
            dailyReport={dailyReport}
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
            mistakeCount={mistakeCount}
            reportUnlocked={reportUnlocked}
            sessionCount={sessionCount}
            transcriptMinutes={transcriptMinutes}
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

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </SafeAreaView>
  );
}

function AppHeader({
  now,
  reportUnlocked,
}: {
  now: Date;
  reportUnlocked: boolean;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.appName}>Pro Speech</Text>
        <Text style={styles.title}>Today</Text>
        <Text style={styles.subtitle}>{formatDisplayDate(now)}</Text>
      </View>
      <View
        style={[styles.reportBadge, reportUnlocked && styles.reportBadgeReady]}
      >
        <Text
          style={[
            styles.reportBadgeText,
            reportUnlocked && styles.reportBadgeReadyText,
          ]}
        >
          {reportUnlocked ? 'Report ready' : reportCountdown(now)}
        </Text>
      </View>
    </View>
  );
}

function RecordTab({
  captureState,
  dailyReport,
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
  dailyReport: DailyReport | null;
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
  return (
    <>
      <ScreenIntro
        title="Record"
        subtitle="Capture a conversation and review the analysis as soon as it finishes."
      />

      <VoiceStatusCard voiceProfile={voiceProfile} onPress={onManageVoice} />

      <View style={styles.capturePanel}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelEyebrow}>Capture</Text>
            <Text style={styles.panelTitle}>Conversation</Text>
          </View>
          <View
            style={[
              styles.stateBadge,
              isRecording && styles.stateBadgeLive,
              isUploading && styles.stateBadgeWorking,
            ]}
          >
            <Text
              style={[
                styles.stateBadgeText,
                isRecording && styles.stateBadgeLiveText,
                isUploading && styles.stateBadgeWorkingText,
              ]}
            >
              {captureState}
            </Text>
          </View>
        </View>

        <View style={styles.timerBlock}>
          <Text style={styles.timer}>{formatDuration(recordSeconds)}</Text>
          <Text style={styles.timerLabel}>
            {isRecording
              ? 'Listening'
              : isUploading
              ? 'Processing audio'
              : 'Idle'}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={isUploading || isSavingVoice || isEnrollingVoice}
          style={({ pressed }) => [
            styles.recordButton,
            isRecording && styles.stopButton,
            pressed && styles.pressedButton,
            (isUploading || isSavingVoice || isEnrollingVoice) &&
              styles.disabledButton,
          ]}
          onPress={onRecordPress}
        >
          <Text style={styles.recordButtonText}>
            {isRecording ? 'Stop and analyze' : 'Start recording'}
          </Text>
        </Pressable>

        {isUploading && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator color={colors.teal} />
            <Text style={styles.uploadingText}>
              Preparing your latest analysis
            </Text>
          </View>
        )}
      </View>

      <View style={styles.summaryPanel}>
        <View style={styles.sectionHeaderCompact}>
          <Text style={styles.sectionHeading}>Today at a glance</Text>
          <Text style={styles.sectionMeta}>
            {dailyReport ? 'Updated' : 'Waiting'}
          </Text>
        </View>
        <View style={styles.statsPanel}>
          <Metric label="Sessions" value={String(sessionCount)} tone="teal" />
          <Metric
            label="Minutes"
            value={String(transcriptMinutes)}
            tone="blue"
          />
          <Metric label="Patterns" value={String(mistakeCount)} tone="amber" />
        </View>
        <Text style={styles.helperText}>
          {latestSession
            ? 'Latest analysis is available in Insights.'
            : 'Start a recording to create your first session analysis.'}
        </Text>
      </View>
    </>
  );
}

function InsightsTab({
  dailyReport,
  isUploading,
  latestSession,
  mistakeCount,
  reportUnlocked,
  sessionCount,
  transcriptMinutes,
}: {
  dailyReport: DailyReport | null;
  isUploading: boolean;
  latestSession: ConversationSession | null;
  mistakeCount: number;
  reportUnlocked: boolean;
  sessionCount: number;
  transcriptMinutes: number;
}) {
  return (
    <>
      <ScreenIntro
        title="Insights"
        subtitle="Review the latest session and track the patterns building through the day."
      />

      <View style={styles.statsPanel}>
        <Metric label="Sessions" value={String(sessionCount)} tone="teal" />
        <Metric label="Minutes" value={String(transcriptMinutes)} tone="blue" />
        <Metric label="Patterns" value={String(mistakeCount)} tone="amber" />
      </View>

      {isUploading ? (
        <View style={styles.analysisPendingPanel}>
          <ActivityIndicator color={colors.teal} />
          <View style={styles.analysisPendingCopy}>
            <Text style={styles.analysisPendingTitle}>Analyzing audio</Text>
            <Text style={styles.analysisPendingText}>
              The session report will appear here when processing finishes.
            </Text>
          </View>
        </View>
      ) : null}

      {latestSession ? (
        <SessionReportView session={latestSession} />
      ) : (
        <EmptyState
          title="No session analysis yet"
          text="Record a conversation to see speaker filtering, mistakes, and transcript details."
        />
      )}

      <ReportView report={dailyReport} reportUnlocked={reportUnlocked} />
    </>
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
  return (
    <>
      <ScreenIntro
        title="Voice"
        subtitle="Create and update the profile used to ignore other speakers in your conversations."
      />

      <VoiceStatusCard voiceProfile={voiceProfile} />

      <View style={styles.capturePanel}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelEyebrow}>Profile</Text>
            <Text style={styles.panelTitle}>Voice lock</Text>
          </View>
          <View
            style={[
              styles.stateBadge,
              isEnrollingVoice && styles.stateBadgeLive,
            ]}
          >
            <Text
              style={[
                styles.stateBadgeText,
                isEnrollingVoice && styles.stateBadgeLiveText,
              ]}
            >
              {isEnrollingVoice ? 'Recording' : 'Ready'}
            </Text>
          </View>
        </View>

        <Text style={styles.profileBody}>
          A short voice sample helps Pro Speech analyze only your speech when a
          conversation has multiple people.
        </Text>

        <VoiceProfileControl
          voiceProfile={voiceProfile}
          isEnrollingVoice={isEnrollingVoice}
          voiceEnrollSeconds={voiceEnrollSeconds}
          isSavingVoice={isSavingVoice}
          onPress={onPress}
        />
      </View>

      <View style={styles.educationPanel}>
        <Text style={styles.sectionHeading}>How analysis works</Text>
        <ProfileStep
          index="1"
          title="Enroll your voice"
          text="Record a sample so the backend has a reference."
        />
        <ProfileStep
          index="2"
          title="Record conversations"
          text="Sessions can include multiple speakers."
        />
        <ProfileStep
          index="3"
          title="Filter and report"
          text="Only confident matches are used for your mistake report."
        />
      </View>
    </>
  );
}

function ScreenIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.screenIntro}>
      <Text style={styles.screenTitle}>{title}</Text>
      <Text style={styles.screenSubtitle}>{subtitle}</Text>
    </View>
  );
}

function VoiceStatusCard({
  voiceProfile,
  onPress,
}: {
  voiceProfile: VoiceProfileStatus | null;
  onPress?: () => void;
}) {
  const ready = Boolean(voiceProfile?.enrolled);

  return (
    <View
      style={[styles.voiceStatusPanel, ready && styles.voiceStatusPanelActive]}
    >
      <View style={[styles.statusDot, ready && styles.statusDotActive]} />
      <View style={styles.voiceStatusCopy}>
        <Text style={styles.voiceStatusTitle}>
          {ready ? 'Voice lock active' : 'Voice lock not set'}
        </Text>
        <Text style={styles.voiceStatusText}>
          {ready
            ? profileSampleText(voiceProfile)
            : 'Create a profile before long conversations.'}
        </Text>
      </View>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [
            styles.manageButton,
            pressed && styles.pressedButton,
          ]}
        >
          <Text style={styles.manageButtonText}>Manage</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateText}>{text}</Text>
    </View>
  );
}

function ProfileStep({
  index,
  title,
  text,
}: {
  index: string;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.profileStep}>
      <View style={styles.profileStepIndex}>
        <Text style={styles.profileStepIndexText}>{index}</Text>
      </View>
      <View style={styles.profileStepCopy}>
        <Text style={styles.profileStepTitle}>{title}</Text>
        <Text style={styles.profileStepText}>{text}</Text>
      </View>
    </View>
  );
}

function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}) {
  return (
    <View style={styles.tabBar}>
      <TabButton
        active={activeTab === 'record'}
        label="Record"
        onPress={() => onTabChange('record')}
      />
      <TabButton
        active={activeTab === 'insights'}
        label="Insights"
        onPress={() => onTabChange('insights')}
      />
      <TabButton
        active={activeTab === 'voice'}
        label="Voice"
        onPress={() => onTabChange('voice')}
      />
    </View>
  );
}

function TabButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
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
        pressed && styles.pressedButton,
      ]}
    >
      <Text
        style={[styles.tabButtonText, active && styles.tabButtonTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'teal' | 'blue' | 'amber';
}) {
  const toneStyle =
    tone === 'blue'
      ? styles.metricValueBlue
      : tone === 'amber'
      ? styles.metricValueAmber
      : styles.metricValueTeal;

  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, toneStyle]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function VoiceProfileControl({
  voiceProfile,
  isEnrollingVoice,
  voiceEnrollSeconds,
  isSavingVoice,
  onPress,
}: {
  voiceProfile: VoiceProfileStatus | null;
  isEnrollingVoice: boolean;
  voiceEnrollSeconds: number;
  isSavingVoice: boolean;
  onPress: () => void;
}) {
  const enrolled = Boolean(voiceProfile?.enrolled);

  return (
    <View style={styles.voiceProfileBlock}>
      <View style={styles.voiceProfileCopy}>
        <Text style={styles.voiceProfileLabel}>Voice profile</Text>
        <Text style={styles.voiceProfileStatus}>
          {isEnrollingVoice
            ? `Recording sample ${formatDuration(voiceEnrollSeconds)}`
            : enrolled
            ? profileSampleText(voiceProfile)
            : 'Required for speaker filtering'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={isSavingVoice}
        style={({ pressed }) => [
          styles.voiceButton,
          isEnrollingVoice && styles.stopButton,
          pressed && styles.pressedButton,
          isSavingVoice && styles.disabledButton,
        ]}
        onPress={onPress}
      >
        <Text style={styles.voiceButtonText}>
          {isSavingVoice
            ? 'Saving...'
            : isEnrollingVoice
            ? `Stop ${formatDuration(voiceEnrollSeconds)}`
            : enrolled
            ? 'Update voice'
            : 'Set voice'}
        </Text>
      </Pressable>
    </View>
  );
}

async function requestMicrophonePermission() {
  if (Platform.OS !== 'android') {
    return true;
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Microphone access',
      message: 'Pro Speech needs microphone access to analyze conversations.',
      buttonPositive: 'Allow',
      buttonNegative: 'Cancel',
    },
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function reportCountdown(date: Date) {
  const reportTime = new Date(date);
  reportTime.setHours(REPORT_HOUR, 0, 0, 0);
  const remainingMs = Math.max(0, reportTime.getTime() - date.getTime());
  const totalMinutes = Math.ceil(remainingMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m until 8:00 PM report`;
  }

  return `${hours}h ${minutes}m until 8:00 PM report`;
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
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
  safeArea: {
    flex: 1,
    backgroundColor: colors.appBackground,
    overflow: 'hidden',
  },
  backgroundCanvas: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.appBackground,
  },
  backgroundTop: {
    backgroundColor: colors.backgroundTop,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    height: 280,
  },
  backgroundShelf: {
    backgroundColor: colors.backgroundShelf,
    height: 180,
    marginTop: 74,
  },
  scroll: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 24,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerCopy: {
    flex: 1,
    paddingRight: 14,
  },
  appName: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
  },
  subtitle: {
    color: colors.inkSubtle,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 3,
  },
  reportBadge: {
    backgroundColor: colors.amberSoft,
    borderColor: colors.glassStroke,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 1,
    marginTop: 3,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  reportBadgeReady: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.glassStroke,
  },
  reportBadgeText: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '800',
  },
  reportBadgeReadyText: {
    color: colors.green,
  },
  screenIntro: {
    marginBottom: 14,
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0,
  },
  screenSubtitle: {
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 4,
  },
  voiceStatusPanel: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    padding: 14,
    ...shadows.card,
  },
  voiceStatusPanelActive: {
    borderColor: colors.glassHighlight,
  },
  statusDot: {
    backgroundColor: colors.amber,
    borderRadius: 999,
    height: 12,
    width: 12,
  },
  statusDotActive: {
    backgroundColor: colors.green,
  },
  voiceStatusCopy: {
    flex: 1,
  },
  voiceStatusTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  voiceStatusText: {
    color: colors.inkSubtle,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 2,
  },
  manageButton: {
    alignItems: 'center',
    backgroundColor: colors.blueSoft,
    borderColor: colors.glassStroke,
    borderWidth: 1,
    borderRadius: 8,
    minWidth: 76,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  manageButtonText: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '800',
  },
  statsPanel: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  summaryPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
    ...shadows.card,
  },
  sectionHeaderCompact: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeading: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sectionMeta: {
    color: colors.inkSubtle,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  helperText: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  metric: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 13,
    ...shadows.card,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0,
  },
  metricValueTeal: {
    color: colors.teal,
  },
  metricValueBlue: {
    color: colors.blue,
  },
  metricValueAmber: {
    color: colors.amber,
  },
  metricLabel: {
    color: colors.inkSubtle,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  capturePanel: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
    ...shadows.panel,
  },
  panelHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  panelEyebrow: {
    color: colors.inkSubtle,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0,
  },
  stateBadge: {
    backgroundColor: colors.slateSoft,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  stateBadgeLive: {
    backgroundColor: colors.redSoft,
  },
  stateBadgeWorking: {
    backgroundColor: colors.blueSoft,
  },
  stateBadgeText: {
    color: colors.slate,
    fontSize: 12,
    fontWeight: '800',
  },
  stateBadgeLiveText: {
    color: colors.red,
  },
  stateBadgeWorkingText: {
    color: colors.blue,
  },
  timerBlock: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    paddingVertical: 18,
  },
  timer: {
    color: colors.ink,
    fontSize: 48,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    letterSpacing: 0,
  },
  timerLabel: {
    color: colors.inkSubtle,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  recordButton: {
    alignItems: 'center',
    backgroundColor: colors.blue,
    borderColor: colors.glassHighlight,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 16,
  },
  pressedButton: {
    opacity: 0.82,
  },
  stopButton: {
    backgroundColor: colors.red,
  },
  disabledButton: {
    opacity: 0.55,
  },
  recordButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '800',
  },
  uploadingRow: {
    alignItems: 'center',
    backgroundColor: colors.tealSoft,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  uploadingText: {
    color: colors.tealDark,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  analysisPendingPanel: {
    alignItems: 'center',
    backgroundColor: colors.tealSoft,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    padding: 14,
  },
  analysisPendingCopy: {
    flex: 1,
  },
  analysisPendingTitle: {
    color: colors.tealDark,
    fontSize: 15,
    fontWeight: '800',
  },
  analysisPendingText: {
    color: colors.tealDark,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 2,
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
    ...shadows.card,
  },
  emptyStateTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptyStateText: {
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  profileBody: {
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  voiceProfileBlock: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 12,
    padding: 12,
  },
  voiceProfileCopy: {
    flex: 1,
    paddingRight: 8,
  },
  voiceProfileLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  voiceProfileStatus: {
    color: colors.inkSubtle,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 2,
  },
  voiceButton: {
    alignItems: 'center',
    backgroundColor: colors.blue,
    borderColor: colors.glassHighlight,
    borderWidth: 1,
    borderRadius: 8,
    minWidth: 110,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  voiceButtonText: {
    color: colors.onAccent,
    fontSize: 13,
    fontWeight: '800',
  },
  educationPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
    ...shadows.card,
  },
  profileStep: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  profileStepIndex: {
    alignItems: 'center',
    backgroundColor: colors.blueSoft,
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  profileStepIndexText: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '800',
  },
  profileStepCopy: {
    flex: 1,
  },
  profileStepTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  profileStepText: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 2,
  },
  tabBar: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.glassStroke,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...shadows.panel,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  tabButtonActive: {
    backgroundColor: colors.blueSoft,
  },
  tabButtonText: {
    color: colors.inkSubtle,
    fontSize: 13,
    fontWeight: '800',
  },
  tabButtonTextActive: {
    color: colors.blue,
  },
});
