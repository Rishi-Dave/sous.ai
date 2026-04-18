import { StatusBar } from 'expo-status-bar';
import { useEffect, useReducer, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createSession, IS_MOCK, sendUtterance } from './src/api/client';
import { initialState, reducer } from './src/state/machine';
import type { Action, MachineState } from './src/state/machine';

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
    case 'Armed': return 'Simulate wake word';
    case 'Listening': return 'Simulate silence (end utterance)';
    case 'Processing': return '…waiting for backend';
    case 'Speaking': return 'Simulate playback end';
    case 'Done': return 'Session finalized';
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createSession('demo-user')
      .then((res) => setSessionId(res.session_id))
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (state.tag !== 'Processing' || !sessionId) return;
    // TODO(rh/mic-vad): source this blob from src/audio/recorder.ts::stopRecording() when
    // the real mic is wired. `Blob` is a web-only global; this path is MOCK-only today.
    const blob = new Blob([], { type: 'audio/wav' });
    sendUtterance(sessionId, blob)
      .then((response) => dispatch({ type: 'BACKEND_RESPONDED', response }))
      .catch((e) => setError(String(e)));
  }, [state.tag, sessionId]);

  const action = advanceActionFor(state);
  const canAdvance = action !== null && state.tag !== 'Done';

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
          onPress={() => action && dispatch(action)}
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
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Last response</Text>
            <Text style={styles.mono}>{JSON.stringify(state.context.lastResponse, null, 2)}</Text>
          </View>
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
