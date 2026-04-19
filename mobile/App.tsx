import { StatusBar } from 'expo-status-bar';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createSession, IS_MOCK, sendUtterance } from './src/api/client';
import { cancelRecording, startRecording, stopRecording } from './src/audio/recorder';
import { playAck, stopAck } from './src/audio/tts';
import { initialState, reducer } from './src/state/machine';
import type { Action, MachineState } from './src/state/machine';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
// Design doc §4 rule 1: after TTS playback ends, wait before re-arming Porcupine.
const PLAYBACK_REARM_MS = 300;

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

function advanceLabelFor(tag: MachineState['tag']): string {
  switch (tag) {
    case 'Armed': return 'Wake (tap to start recording)';
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
  const recordedBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    createSession('demo-user')
      .then((res) => setSessionId(res.session_id))
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (state.tag !== 'Listening') return;
    setError(null);
    startRecording().catch((e: unknown) => {
      const name = e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError') {
        setError('Mic permission denied. Grant access and tap Wake again.');
      } else if (name === 'NotFoundError') {
        setError('No microphone found on this device.');
      } else {
        setError(`startRecording failed: ${String(e)}`);
      }
      dispatch({ type: 'MANUAL_STOP' });
    });
    return () => {
      // Fires when state leaves Listening. If we transitioned via SILENCE_DETECTED
      // the button handler already stopped the recorder; this is a no-op then.
      cancelRecording().catch(() => {});
    };
  }, [state.tag]);

  useEffect(() => {
    if (state.tag !== 'Processing' || !sessionId) return;
    const blob = recordedBlobRef.current ?? new Blob([], { type: 'audio/wav' });
    recordedBlobRef.current = null;
    sendUtterance(sessionId, blob)
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
        recordedBlobRef.current = await stopRecording();
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

        <View style={[styles.stateBadge, { backgroundColor: TAG_COLORS[state.tag] }]}>
          <Text style={styles.stateLabel}>{state.tag}</Text>
        </View>

        <Pressable
          accessibilityLabel="Advance state"
          onPress={onAdvance}
          disabled={!canAdvance}
          style={[styles.advanceBtn, !canAdvance && styles.advanceBtnDisabled]}
        >
          <Text style={styles.advanceText}>{advanceLabelFor(state.tag)}</Text>
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
