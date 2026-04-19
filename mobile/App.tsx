import { StatusBar } from 'expo-status-bar';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Pressable, Platform, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createSession, IS_MOCK, sendUtterance, sendWakeProbe } from './src/api/client';
import { useGroqWakeProbe, usePicovoicePorcupine } from './src/config/audioActivation';
import { playDing } from './src/audio/ding';
import { armPorcupine, disarmPorcupine } from './src/audio/porcupine';
import { cancelRecording, startRecording, stopRecording } from './src/audio/recorder';
import { playAck, stopAck } from './src/audio/tts';
import type { MeterReading } from './src/audio/vad';
import { shouldStop } from './src/audio/vad';
import type { RecordedAudio } from './src/audio/types';
import { initialState, reducer } from './src/state/machine';
import type { Action, MachineState } from './src/state/machine';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
// Seeded demo user from supabase/seed.sql — must be a real UUID so the FK to profiles holds.
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';
// Design doc §4 rule 1: after TTS playback ends, wait before re-arming Porcupine.
const PLAYBACK_REARM_MS = 300;
// Hard cap on a single listening window — defense against a missed VAD trigger.
const MAX_LISTEN_MS = 10_000;
// Groq hands-free wake: one short clip per iteration (server transcribes via Whisper).
const GRO_WAKE_CHUNK_MS = 2800;
const GRO_WAKE_GAP_MS = 450;

const TAG_COLORS: Record<MachineState['tag'], string> = {
  Armed: '#1e88e5',
  Listening: '#e53935',
  Processing: '#fb8c00',
  Speaking: '#43a047',
  Done: '#616161',
};

function advanceActionFor(state: MachineState): Action | null {
  switch (state.tag) {
    case 'Armed': return { type: 'WAKE_DETECTED' };
    case 'Listening': return { type: 'SILENCE_DETECTED' };
    case 'Processing': return null;
    case 'Speaking': return { type: 'PLAYBACK_ENDED' };
    case 'Done': return null;
  }
}

function advanceLabelFor(tag: MachineState['tag'], handsFreeWake: boolean): string {
  switch (tag) {
    case 'Armed':
      return handsFreeWake
        ? 'Wake (“Hey Sous” or tap)'
        : 'Start recording (tap)';
    case 'Listening': return 'Stop recording';
    case 'Processing': return '…waiting for backend';
    case 'Speaking': return 'Simulate playback end';
    case 'Done': return 'Session finalized';
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const recordedAudioRef = useRef<RecordedAudio | null>(null);
  const porcupineOn = usePicovoicePorcupine();
  const groqWakeOn = useGroqWakeProbe() && Platform.OS !== 'web';
  const handsFreeWake = porcupineOn || groqWakeOn;

  useEffect(() => {
    createSession(DEMO_USER_ID)
      .then((res) => setSessionId(res.session_id))
      .catch((e) => setError(String(e)));
  }, []);

  // Porcupine: opt-in via EXPO_PUBLIC_USE_PORCUPINE + EXPO_PUBLIC_PICOVOICE_ACCESS_KEY.
  // Cleanup releases the mic so expo-av can record — one audio consumer at a time.
  useEffect(() => {
    if (!porcupineOn || state.tag !== 'Armed' || !sessionId) return;
    let cancelled = false;
    armPorcupine(() => {
      if (cancelled) return;
      dispatch({ type: 'WAKE_DETECTED' });
    }).catch((e: unknown) => {
      setError(`armPorcupine failed: ${String(e)}`);
    });
    return () => {
      cancelled = true;
      disarmPorcupine().catch(() => {});
    };
  }, [porcupineOn, state.tag, sessionId]);

  // Optional Groq wake: short expo-av clips in Armed, POST /wake_probe (no Porcupine).
  useEffect(() => {
    if (!groqWakeOn || state.tag !== 'Armed' || !sessionId || IS_MOCK) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    (async () => {
      while (!cancelled) {
        await disarmPorcupine().catch(() => {});
        try {
          await startRecording();
        } catch (e: unknown) {
          if (!cancelled) {
            const name = e instanceof Error ? e.name : '';
            if (name === 'NotAllowedError') {
              setError('Mic permission denied. Enable the mic for hands-free wake, or tap Wake.');
            } else {
              setError(`Groq wake could not open mic: ${String(e)}`);
            }
          }
          return;
        }
        await sleep(GRO_WAKE_CHUNK_MS);
        if (cancelled) {
          await cancelRecording().catch(() => {});
          return;
        }
        let clip: RecordedAudio;
        try {
          clip = await stopRecording();
        } catch {
          await cancelRecording().catch(() => {});
          await sleep(GRO_WAKE_GAP_MS);
          continue;
        }
        try {
          const { wake } = await sendWakeProbe(clip);
          if (wake && !cancelled) {
            dispatch({ type: 'WAKE_DETECTED' });
            return;
          }
        } catch {
          // Backend or network blip — keep probing.
        }
        await sleep(GRO_WAKE_GAP_MS);
      }
    })();

    return () => {
      cancelled = true;
      cancelRecording().catch(() => {});
    };
  }, [groqWakeOn, state.tag, sessionId]);

  useEffect(() => {
    if (state.tag !== 'Listening') return;
    setError(null);
    let cancelled = false;
    let hardCapTimer: ReturnType<typeof setTimeout> | null = null;
    let stopping = false;
    const readings: MeterReading[] = [];

    const autoStop = async () => {
      if (cancelled || stopping) return;
      stopping = true;
      if (hardCapTimer) clearTimeout(hardCapTimer);
      try {
        recordedAudioRef.current = await stopRecording();
        if (!cancelled) dispatch({ type: 'SILENCE_DETECTED' });
      } catch (e) {
        setError(`stopRecording failed: ${String(e)}`);
        if (!cancelled) dispatch({ type: 'MANUAL_STOP' });
      }
    };

    (async () => {
      // Disarm here too in case the Armed cleanup hasn't yet released the mic.
      // Ordering: Porcupine off → ding → mic on (single audio consumer rule).
      await disarmPorcupine().catch(() => {});
      await playDing();
      if (cancelled) return;
      try {
        await startRecording({
          onMeter: (db, t) => {
            if (cancelled || stopping) return;
            readings.push({ db, t });
            if (shouldStop(readings)) autoStop();
          },
        });
      } catch (e: unknown) {
        if (cancelled) return;
        const name = e instanceof Error ? e.name : '';
        if (name === 'NotAllowedError') {
          setError('Mic permission denied. Grant access and tap Wake again.');
        } else if (name === 'NotFoundError') {
          setError('No microphone found on this device.');
        } else {
          setError(`startRecording failed: ${String(e)}`);
        }
        dispatch({ type: 'MANUAL_STOP' });
        return;
      }
      if (cancelled) {
        await cancelRecording().catch(() => {});
        return;
      }
      hardCapTimer = setTimeout(autoStop, MAX_LISTEN_MS);
    })();

    return () => {
      cancelled = true;
      if (hardCapTimer) clearTimeout(hardCapTimer);
      // If autoStop already ran, the recorder is already stopped — cancelRecording is a no-op.
      cancelRecording().catch(() => {});
    };
  }, [state.tag]);

  useEffect(() => {
    if (state.tag !== 'Processing' || !sessionId) return;
    const audio = recordedAudioRef.current ?? new Blob([], { type: 'audio/wav' });
    recordedAudioRef.current = null;
    sendUtterance(sessionId, audio)
      .then((response) => dispatch({ type: 'BACKEND_RESPONDED', response }))
      .catch((e) => {
        setError(String(e));
        dispatch({ type: 'MANUAL_STOP' });
      });
  }, [state.tag, sessionId]);

  useEffect(() => {
    if (state.tag !== 'Speaking') return;
    const url = state.context.lastResponse?.ack_audio_url;
    if (!url) {
      dispatch({ type: 'PLAYBACK_ENDED' });
      return;
    }
    const fullUrl = url.startsWith('/') ? `${BACKEND_URL}${url}` : url;
    let cancelled = false;
    let rearmTimer: ReturnType<typeof setTimeout> | null = null;

    playAck(fullUrl)
      .catch((e: unknown) => {
        // Swallow and still advance — a playback failure must not wedge the machine.
        setError(`Playback failed: ${String(e)}`);
      })
      .then(() => {
        if (cancelled) return;
        rearmTimer = setTimeout(() => dispatch({ type: 'PLAYBACK_ENDED' }), PLAYBACK_REARM_MS);
      });

    return () => {
      cancelled = true;
      if (rearmTimer) clearTimeout(rearmTimer);
      stopAck();
    };
  }, [state.tag, state.context.lastResponse]);

  const action = advanceActionFor(state);
  const canAdvance = action !== null && state.tag !== 'Done' && !isBusy;

  async function onAdvance() {
    if (!action) return;
    if (state.tag === 'Listening') {
      setIsBusy(true);
      try {
        try {
          recordedAudioRef.current = await stopRecording();
        } catch (e) {
          // VAD or 10s hard-cap may have already stopped the recorder. That path
          // dispatches SILENCE_DETECTED itself, so the manual tap should be a no-op.
          if (e instanceof Error && /not recording/i.test(e.message)) return;
          throw e;
        }
        dispatch({ type: 'SILENCE_DETECTED' });
      } catch (e) {
        setError(`stopRecording failed: ${String(e)}`);
        dispatch({ type: 'MANUAL_STOP' });
      } finally {
        setIsBusy(false);
      }
      return;
    }
    dispatch(action);
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Sous Chef — dev mock</Text>
        <Text style={styles.subtitle}>MOCK: {IS_MOCK ? 'on' : 'off'} · session: {sessionId ?? '…'}</Text>

        {state.tag === 'Armed' && sessionId && (
          <Text style={styles.hint}>
            {porcupineOn && 'Wake: on-device Porcupine — say your wake phrase or tap the button.'}
            {!porcupineOn && groqWakeOn && !IS_MOCK && (
              'Wake: server checks short clips for “Hey Sous” / “Hey Chef” — or tap the button.'
            )}
            {!porcupineOn && (!groqWakeOn || IS_MOCK) && (
              'Wake: tap the button below to start recording (on-demand; no always-on mic).'
            )}
          </Text>
        )}

        <View style={[styles.stateBadge, { backgroundColor: TAG_COLORS[state.tag] }]}>
          <Text style={styles.stateLabel}>{state.tag}</Text>
        </View>

        <Pressable
          accessibilityLabel="Advance state"
          onPress={onAdvance}
          disabled={!canAdvance}
          style={[styles.advanceBtn, !canAdvance && styles.advanceBtnDisabled]}
        >
          <Text style={styles.advanceText}>{advanceLabelFor(state.tag, handsFreeWake)}</Text>
        </Pressable>

        <Pressable
          accessibilityLabel="Manual stop"
          onPress={() => dispatch({ type: 'MANUAL_STOP' })}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryText}>Manual stop</Text>
        </Pressable>

        <Pressable
          accessibilityLabel="Finalize"
          // TODO(rh/summary-screen): also call finalize(sessionId, recipeName) from api/client
          // and transition to the summary screen. Today this is a local-only state advance.
          onPress={() => dispatch({ type: 'FINALIZE' })}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryText}>Finalize (local only)</Text>
        </Pressable>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Current ingredients</Text>
          {state.context.currentIngredients.length === 0 ? (
            <Text style={styles.empty}>none</Text>
          ) : (
            state.context.currentIngredients.map((ing, i) => (
              <Text key={`${ing.name}-${i}`} style={styles.ingredient}>
                • {ing.raw_phrase}
              </Text>
            ))
          )}
        </View>

        {state.context.lastResponse && (
          <>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Intent</Text>
              <Text style={styles.ingredient}>{state.context.lastResponse.intent}</Text>
            </View>

            {state.context.lastResponse.items && state.context.lastResponse.items.length > 0 && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Parsed items</Text>
                {state.context.lastResponse.items.map((item, i) => (
                  <Text key={`item-${i}`} style={styles.ingredient}>
                    • {item.raw_phrase}
                    {item.qty != null ? ` — ${item.qty}${item.unit ? ' ' + item.unit : ''}` : ''}
                  </Text>
                ))}
              </View>
            )}

            {state.context.lastResponse.answer && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Answer</Text>
                <Text style={styles.ingredient}>{state.context.lastResponse.answer}</Text>
              </View>
            )}

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Raw response</Text>
              <Text style={styles.mono}>{JSON.stringify(state.context.lastResponse, null, 2)}</Text>
            </View>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafafa' },
  container: { padding: 24, alignItems: 'stretch', gap: 12 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 12, color: '#555', textAlign: 'center', marginBottom: 12 },
  hint: {
    fontSize: 13,
    color: '#424242',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  stateBadge: {
    alignSelf: 'center',
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  stateLabel: { color: '#fff', fontSize: 28, fontWeight: '700' },
  advanceBtn: {
    backgroundColor: '#212121',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  advanceBtnDisabled: { backgroundColor: '#9e9e9e' },
  advanceText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    borderColor: '#bdbdbd',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryText: { color: '#424242', fontSize: 14 },
  panel: {
    backgroundColor: '#fff',
    borderColor: '#e0e0e0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  panelTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: '#616161', marginBottom: 8 },
  empty: { color: '#9e9e9e', fontStyle: 'italic' },
  ingredient: { fontSize: 14, color: '#212121' },
  mono: { fontFamily: 'Courier', fontSize: 11, color: '#424242' },
  error: { color: '#c62828', textAlign: 'center' },
});
