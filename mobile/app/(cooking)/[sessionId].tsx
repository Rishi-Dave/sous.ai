import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';

import { HeaderStrip } from '../../src/components/HeaderStrip';
import { MicCard } from '../../src/components/MicCard';
import type { MicState } from '../../src/components/MicCard';
import { IngredientRow } from '../../src/components/IngredientRow';

import { finalize, sendUtterance } from '../../src/api/client';
import { playDing } from '../../src/audio/ding';
import { armPorcupine, disarmPorcupine } from '../../src/audio/porcupine';
import { cancelRecording, startRecording, stopRecording } from '../../src/audio/recorder';
import { playAck, stopAck } from '../../src/audio/tts';
import { shouldStop } from '../../src/audio/vad';
import type { MeterReading } from '../../src/audio/vad';
import type { RecordedAudio } from '../../src/audio/types';

import { useCooking } from '../../src/state/CookingContext';
import { deriveRecipeName } from '../../src/util/recipeName';

import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { radii } from '../../src/theme/spacing';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
// Design doc §4 rule 1: after TTS playback ends, wait before re-arming Porcupine.
const PLAYBACK_REARM_MS = 300;
// Hard cap on a single listening window — defense against a missed VAD trigger.
const MAX_LISTEN_MS = 10_000;

function micStateFor(tag: string): MicState | null {
  switch (tag) {
    case 'Armed':
      return 'armed';
    case 'Listening':
      return 'listening';
    case 'Processing':
      return 'processing';
    case 'Speaking':
      return 'speaking';
    default:
      return null;
  }
}

function firstParam(v: string | string[] | undefined): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

export default function CookingScreen() {
  const params = useLocalSearchParams<{ sessionId: string; recipeId?: string }>();
  const sid = firstParam(params.sessionId);
  const rid = firstParam(params.recipeId) ?? null;

  const router = useRouter();
  const { state, dispatch, setFinalizeResponse, error, setError } = useCooking();
  const isFocused = useIsFocused();
  const recordedAudioRef = useRef<RecordedAudio | null>(null);
  const [finalizeInFlight, setFinalizeInFlight] = useState(false);

  // Armed effect: arm Porcupine; dispatch WAKE_DETECTED on detection.
  useEffect(() => {
    if (!isFocused || state.tag !== 'Armed' || !sid) return;
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
  }, [isFocused, state.tag, sid, dispatch, setError]);

  // Listening effect: single-consumer rule — disarm Porcupine → ding → start recording → VAD stops.
  useEffect(() => {
    if (!isFocused || state.tag !== 'Listening') return;
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
      cancelRecording().catch(() => {});
    };
  }, [isFocused, state.tag, dispatch, setError]);

  // Processing effect: upload audio, dispatch BACKEND_RESPONDED.
  useEffect(() => {
    if (!isFocused || state.tag !== 'Processing' || !sid) return;
    const audio =
      recordedAudioRef.current ?? (new Blob([], { type: 'audio/wav' }) as RecordedAudio);
    recordedAudioRef.current = null;
    sendUtterance(sid, audio)
      .then((response) => dispatch({ type: 'BACKEND_RESPONDED', response }))
      .catch((e) => {
        setError(String(e));
        dispatch({ type: 'MANUAL_STOP' });
      });
  }, [isFocused, state.tag, sid, dispatch, setError]);

  // Speaking effect: play ack, then dispatch PLAYBACK_ENDED after 300ms re-arm buffer.
  useEffect(() => {
    if (!isFocused || state.tag !== 'Speaking') return;
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
        // Swallow and advance — a playback failure must not wedge the machine.
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
  }, [isFocused, state.tag, state.context.lastResponse, dispatch, setError]);

  // Blur: disarm everything when navigating away. Keeps the single-audio-consumer
  // rule intact across route boundaries.
  useEffect(() => {
    if (isFocused) return;
    disarmPorcupine().catch(() => {});
    cancelRecording().catch(() => {});
    stopAck();
  }, [isFocused]);

  // Auto-nav on finish_recipe intent: run finalize() in parallel with ack TTS,
  // then push to summary. Guarded by finalizeInFlight so this only fires once.
  useEffect(() => {
    if (!isFocused) return;
    if (finalizeInFlight) return;
    if (state.tag !== 'Speaking') return;
    if (state.context.lastResponse?.intent !== 'finish_recipe') return;
    if (!sid) return;
    setFinalizeInFlight(true);
    const recipeName = deriveRecipeName(rid, state.context.currentIngredients);
    (async () => {
      try {
        const res = await finalize(sid, recipeName);
        setFinalizeResponse(res);
        router.push('/(cooking)/summary');
      } catch (e) {
        setError(`Finalize failed: ${String(e)}`);
        setFinalizeInFlight(false);
      }
    })();
  }, [
    isFocused,
    finalizeInFlight,
    state.tag,
    state.context.lastResponse,
    state.context.currentIngredients,
    sid,
    rid,
    router,
    setFinalizeResponse,
    setError,
  ]);

  const onFinish = async () => {
    if (finalizeInFlight || !sid) return;
    setFinalizeInFlight(true);
    const recipeName = deriveRecipeName(rid, state.context.currentIngredients);
    try {
      const res = await finalize(sid, recipeName);
      setFinalizeResponse(res);
      router.push('/(cooking)/summary');
    } catch (e) {
      setError(`Finalize failed: ${String(e)}`);
      setFinalizeInFlight(false);
    }
  };

  const onWakeTap = () => {
    if (state.tag === 'Armed') dispatch({ type: 'WAKE_DETECTED' });
  };

  const ms = micStateFor(state.tag);
  const ingredients = state.context.currentIngredients;
  const last = state.context.lastResponse;
  const assistantText = last?.answer ?? last?.items?.[0]?.raw_phrase;

  return (
    <SafeAreaView style={styles.root}>
      <HeaderStrip
        eyebrow="Cooking"
        title="Live session"
        subtitle="Say 'hey sous' or tap the mic to add ingredients"
      />
      <ScrollView contentContainerStyle={styles.body}>
        {ms ? <MicCard state={ms} assistantText={assistantText} onTap={onWakeTap} /> : null}

        <Text style={styles.eyebrow}>
          Ingredients{ingredients.length ? ` (${ingredients.length})` : ''}
        </Text>
        {ingredients.length === 0 ? (
          <Text style={styles.empty}>
            No ingredients yet — tap the mic and tell me what you're using.
          </Text>
        ) : (
          <View style={styles.list}>
            {ingredients.map((ing, i) => (
              <IngredientRow
                key={`${ing.name}-${i}`}
                name={ing.name}
                quantity={
                  ing.qty != null ? `${ing.qty}${ing.unit ? ' ' + ing.unit : ''}` : undefined
                }
                last={i === ingredients.length - 1}
              />
            ))}
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={onFinish}
          disabled={finalizeInFlight || ingredients.length === 0}
          style={[
            styles.cta,
            (finalizeInFlight || ingredients.length === 0) && styles.ctaDisabled,
          ]}
          accessibilityLabel="Finish cooking"
        >
          <Text style={styles.ctaText}>{finalizeInFlight ? 'Saving…' : 'Finish cooking'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  body: { padding: 20, gap: 18 },
  eyebrow: { ...typography.eyebrow, color: colors.mutedGreen },
  empty: { ...typography.body, color: colors.mutedGreen, fontStyle: 'italic' },
  list: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderGrey,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: colors.borderGrey },
  cta: {
    backgroundColor: colors.vibrantGreen,
    borderRadius: radii.button,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { ...typography.button, color: colors.cream },
  error: { color: '#c62828', textAlign: 'center' },
});
