import type {
  CreateSessionRequest,
  CreateSessionResponse,
  FinalizeRequest,
  FinalizeResponse,
  UtteranceResponse,
} from './types';
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

export async function sendUtterance(sessionId: string, audio: Blob): Promise<UtteranceResponse> {
  if (MOCK) return mockSendUtterance(sessionId, audio);

  const form = new FormData();
  form.append('session_id', sessionId);
  // TODO(rh/phone-mic): RN FormData wants `{ uri, name, type }` not a Blob. This path
  // works on web (MediaRecorder hands us a real Blob); phone wiring replaces it.
  form.append('audio', audio, 'audio.wav');
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
