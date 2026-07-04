import { Platform } from 'react-native';

const API_URL =
  Platform.select({
    android: 'http://10.0.2.2:8080',
    ios: 'http://localhost:8080',
    default: 'http://localhost:8080',
  }) ?? 'http://localhost:8080';

export interface Mistake {
  original: string;
  correction: string;
  reason: string;
  category?: string;
  count?: number;
  speaker?: string;
}

export interface SpeakerScore {
  speaker: string;
  score: number;
}

export interface VoiceMatch {
  status: string;
  speaker?: string;
  confidence?: number;
  scores?: SpeakerScore[];
  notice?: string;
}

export interface VoiceProfileStatus {
  enrolled: boolean;
  created_at?: string;
  updated_at?: string;
  sample_count?: number;
}

export interface AnalysisReport {
  transcript: string;
  target_transcript?: string;
  target_speaker?: string;
  speaker_mode?: string;
  speaker_notice?: string;
  speakers?: string[];
  voice_match?: VoiceMatch;
  mistakes: Mistake[];
  summary: string;
}

export interface ConversationSession {
  id: string;
  date: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  transcript: string;
  target_transcript?: string;
  target_speaker?: string;
  speaker_mode?: string;
  speaker_notice?: string;
  speakers?: string[];
  voice_match?: VoiceMatch;
  mistakes: Mistake[];
  summary: string;
}

export interface DailyReport {
  date: string;
  generated_at: string;
  session_count: number;
  recording_seconds: number;
  transcript_minutes: number;
  top_mistakes: Mistake[];
  summary: string;
}

export interface SessionAnalysisResponse {
  session: ConversationSession;
  daily_report: DailyReport;
}

export interface SessionsResponse {
  sessions: ConversationSession[];
}

export interface SessionUploadMetadata {
  date: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  targetSpeaker?: string;
}

export async function analyzeAudio(audioPath: string): Promise<AnalysisReport> {
  const formData = new FormData();
  appendAudio(formData, audioPath);

  return request<AnalysisReport>('/api/analyze', {
    method: 'POST',
    body: formData,
  });
}

export async function getVoiceProfile(): Promise<VoiceProfileStatus> {
  return request<VoiceProfileStatus>('/api/voice-profile');
}

export async function enrollVoiceProfile(
  audioPath: string,
): Promise<VoiceProfileStatus> {
  const formData = new FormData();
  appendAudio(formData, audioPath);

  return request<VoiceProfileStatus>('/api/voice-profile', {
    method: 'POST',
    body: formData,
  });
}

export async function createAudioSession(
  audioPath: string,
  metadata: SessionUploadMetadata,
): Promise<SessionAnalysisResponse> {
  const formData = new FormData();
  appendAudio(formData, audioPath);
  formData.append('date', metadata.date);
  formData.append('started_at', metadata.startedAt);
  formData.append('ended_at', metadata.endedAt);
  formData.append('duration_seconds', String(metadata.durationSeconds));
  if (metadata.targetSpeaker) {
    formData.append('target_speaker', metadata.targetSpeaker);
  }

  return request<SessionAnalysisResponse>('/api/sessions/audio', {
    method: 'POST',
    body: formData,
  });
}

export async function getDailyReport(date: string): Promise<DailyReport> {
  return request<DailyReport>(
    `/api/reports/today?date=${encodeURIComponent(date)}`,
  );
}

export async function getSessions(
  date: string,
): Promise<ConversationSession[]> {
  const response = await request<SessionsResponse>(
    `/api/sessions?date=${encodeURIComponent(date)}`,
  );

  return response.sessions;
}

function appendAudio(formData: FormData, audioPath: string) {
  formData.append('audio', {
    uri: normalizeAudioUri(audioPath),
    type: 'audio/m4a',
    name: 'recording.m4a',
  } as any);
}

function normalizeAudioUri(audioPath: string) {
  if (Platform.OS === 'android' && !audioPath.startsWith('file://')) {
    return `file://${audioPath}`;
  }

  return audioPath;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}
