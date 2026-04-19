import type {
  CreateSessionRequest,
  CreateSessionResponse,
  FinalizeRequest,
  FinalizeResponse,
  UtteranceResponse,
} from './types';
import type { RecordedAudio } from '../audio/types';
import { isNativeRecording } from '../audio/types';
import { mockCreateSession, mockFinalize, mockSendUtterance } from './mock';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const MOCK = process.env.EXPO_PUBLIC_MOCK === '1';

export async function createSession(userId: string): Promise<CreateSessionResponse> {
  const body: CreateSessionRequest = { user_id: userId };
  if (MOCK) return mockCreateSession(body);

  const res = await fetch(`${BACKEND_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createSession failed: ${res.status}`);
  return res.json();
}

export async function sendUtterance(sessionId: string, audio: RecordedAudio): Promise<UtteranceResponse> {
  if (MOCK) return mockSendUtterance(sessionId, audio instanceof Blob ? audio : new Blob([]));

  const form = new FormData();
  form.append('session_id', sessionId);
  if (isNativeRecording(audio)) {
    // React Native FormData accepts a {uri, name, type} descriptor for file parts.
    const part = { uri: audio.uri, name: 'audio.m4a', type: audio.mime } as unknown as Blob;
    form.append('audio', part, 'audio.m4a');
  } else {
    form.append('audio', audio, 'audio.webm');
  }
  const res = await fetch(`${BACKEND_URL}/utterance`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`sendUtterance failed: ${res.status}`);
  return res.json();
}

export async function finalize(sessionId: string, recipeName: string): Promise<FinalizeResponse> {
  const body: FinalizeRequest = { session_id: sessionId, recipe_name: recipeName };
  if (MOCK) return mockFinalize(body);

  const res = await fetch(`${BACKEND_URL}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`finalize failed: ${res.status}`);
  return res.json();
}

export const IS_MOCK = MOCK;
