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
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
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

const REPORT_HOUR = 20;

export function RecordingScreen() {
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingReport}
            onRefresh={() => loadReport(today)}
            tintColor="#0F766E"
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Pro Speech</Text>
          <Text style={styles.subtitle}>Daily English coach</Text>
          <Text style={styles.reportBadge}>
            {reportUnlocked ? '8:00 PM report ready' : reportCountdown(now)}
          </Text>
        </View>

        <View style={styles.statsPanel}>
          <Metric label="Sessions" value={String(sessionCount)} />
          <Metric label="Minutes" value={String(transcriptMinutes)} />
          <Metric
            label="Mistakes"
            value={String(dailyReport?.top_mistakes.length ?? 0)}
          />
        </View>

        <View style={styles.capturePanel}>
          <Text style={styles.panelTitle}>Daily capture</Text>
          <VoiceProfileControl
            voiceProfile={voiceProfile}
            isEnrollingVoice={isEnrollingVoice}
            voiceEnrollSeconds={voiceEnrollSeconds}
            isSavingVoice={isSavingVoice}
            onPress={
              isEnrollingVoice ? onStopVoiceEnrollment : onStartVoiceEnrollment
            }
          />
          <Text style={styles.captureNote}>
            {voiceProfile?.enrolled
              ? 'Voice matching is active. Reports analyze only a confident match for your voice.'
              : 'Set up a voice profile to avoid analyzing someone else in the conversation.'}
          </Text>
          <Text style={styles.timer}>{formatDuration(recordSeconds)}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={isUploading || isSavingVoice || isEnrollingVoice}
            style={[
              styles.recordButton,
              isRecording && styles.stopButton,
              (isUploading || isSavingVoice || isEnrollingVoice) &&
                styles.disabledButton,
            ]}
            onPress={isRecording ? onStopRecord : onStartRecord}
          >
            <Text style={styles.recordButtonText}>
              {isRecording ? 'Stop and analyze' : 'Start listening'}
            </Text>
          </TouchableOpacity>

          {isUploading && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator color="#0F766E" />
              <Text style={styles.uploadingText}>Analyzing session...</Text>
            </View>
          )}
        </View>

        {latestSession && <SessionReportView session={latestSession} />}

        <ReportView report={dailyReport} reportUnlocked={reportUnlocked} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
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
  const sampleText = enrolled
    ? `${voiceProfile?.sample_count || 1} voice sample${
        voiceProfile?.sample_count === 1 ? '' : 's'
      } saved`
    : 'No voice profile';

  return (
    <View style={styles.voiceProfileBlock}>
      <View>
        <Text style={styles.voiceProfileLabel}>Voice profile</Text>
        <Text style={styles.voiceProfileStatus}>{sampleText}</Text>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        disabled={isSavingVoice}
        style={[
          styles.voiceButton,
          isEnrollingVoice && styles.stopButton,
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
      </TouchableOpacity>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 18,
  },
  title: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: '#4B5563',
    fontSize: 15,
    marginTop: 4,
  },
  reportBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderRadius: 8,
    borderWidth: 1,
    color: '#047857',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statsPanel: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  metric: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  metricValue: {
    color: '#0F766E',
    fontSize: 24,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  capturePanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 18,
  },
  panelTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  captureNote: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  voiceProfileBlock: {
    alignItems: 'center',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 12,
  },
  voiceProfileLabel: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  voiceProfileStatus: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  voiceButton: {
    alignItems: 'center',
    backgroundColor: '#334155',
    borderRadius: 8,
    minWidth: 110,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  voiceButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  timer: {
    color: '#111827',
    fontSize: 44,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    marginBottom: 16,
  },
  recordButton: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 8,
    paddingVertical: 15,
  },
  stopButton: {
    backgroundColor: '#B91C1C',
  },
  disabledButton: {
    opacity: 0.6,
  },
  recordButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  uploadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  uploadingText: {
    color: '#475569',
    fontSize: 14,
  },
});
