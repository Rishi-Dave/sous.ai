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

import { EditorialHeader } from '../../src/components/EditorialHeader';
import { MicCard } from '../../src/components/MicCard';
import type { MicState } from '../../src/components/MicCard';
import { IngredientRow } from '../../src/components/IngredientRow';
import { SectionHeading } from '../../src/components/SectionHeading';
import { EmptyIllustration } from '../../src/components/EmptyIllustration';

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
import { radii, scale } from '../../src/theme/spacing';

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
  const {
    state,
    dispatch,
    setFinalizeResponse,
    finalizeStarted,
    setFinalizeStarted,
    error,
    setError,
  } = useCooking();
  const isFocused = useIsFocused();
  const recordedAudioRef = useRef<RecordedAudio | null>(null);
  // Cook-time starts counting when the cooking screen mounts and is sent with
  // the finalize() call. Ref, not state — we don't need to re-render on tick.
  const sessionStartRef = useRef<number>(Date.now());
  const elapsedSeconds = () => Math.max(0, Math.floor((Date.now() - sessionStartRef.current) / 1000));

  // Armed effect: arm Porcupine; dispatch WAKE_DETECTED on detection.
  useEffect(() => {
    if (!isFocused || state.tag !== 'Armed' || !sid) return;
    let cancelled = false;
    armPorcupine(() => {
      if (cancelled) return;
      dispatch({ type: 'WAKE_DETECTED' });
    }).catch((e: unknown) => {
      // Swallow — no Picovoice key in dev, user taps the mic instead of saying "hey sous".
      console.warn('armPorcupine failed:', String(e));
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
    let cancelled = false;
    let rearmTimer: ReturnType<typeof setTimeout> | null = null;

    // Mock utterances ship with mock:// URLs that expo-av can't play. Simulate
    // the ack duration so the loop advances cleanly in the web-mock loop.
    if (url.startsWith('mock://')) {
      rearmTimer = setTimeout(
        () => !cancelled && dispatch({ type: 'PLAYBACK_ENDED' }),
        PLAYBACK_REARM_MS + 800,
      );
      return () => {
        cancelled = true;
        if (rearmTimer) clearTimeout(rearmTimer);
      };
    }

    const fullUrl = url.startsWith('/') ? `${BACKEND_URL}${url}` : url;

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
  // then push to summary. Guarded by `finalizeStarted` (in context) so Undo →
  // back doesn't re-trigger this effect even if the screen remounts.
  useEffect(() => {
    if (!isFocused) return;
    if (finalizeStarted) return;
    if (state.tag !== 'Speaking') return;
    if (state.context.lastResponse?.intent !== 'finish_recipe') return;
    if (!sid) return;
    setFinalizeStarted(true);
    const recipeName = deriveRecipeName(rid, state.context.currentIngredients);
    const cookTime = elapsedSeconds();
    (async () => {
      try {
        const res = await finalize(sid, recipeName, cookTime);
        setFinalizeResponse(res);
        router.push('/(cooking)/summary');
      } catch (e) {
        setError(`Finalize failed: ${String(e)}`);
        setFinalizeStarted(false);
      }
    })();
  }, [
    isFocused,
    finalizeStarted,
    state.tag,
    state.context.lastResponse,
    state.context.currentIngredients,
    sid,
    rid,
    router,
    setFinalizeResponse,
    setFinalizeStarted,
    setError,
  ]);

  const onFinish = async () => {
    if (finalizeStarted || !sid) return;
    setFinalizeStarted(true);
    const recipeName = deriveRecipeName(rid, state.context.currentIngredients);
    const cookTime = elapsedSeconds();
    try {
      const res = await finalize(sid, recipeName, cookTime);
      setFinalizeResponse(res);
      router.push('/(cooking)/summary');
    } catch (e) {
      setError(`Finalize failed: ${String(e)}`);
      setFinalizeStarted(false);
    }
  };

  // MicCard tap handler — branches on state.tag so manual-mode users can both
  // start (Armed → wake) and stop (Listening → send) via the mic button.
  // Mirrors the old App.tsx onAdvance path for Listening.
  const onMicTap = async () => {
    if (state.tag === 'Armed') {
      dispatch({ type: 'WAKE_DETECTED' });
      return;
    }
    if (state.tag === 'Listening') {
      try {
        try {
          recordedAudioRef.current = await stopRecording();
        } catch (e) {
          // VAD or the 10s hard-cap may have already stopped the recorder. That
          // path dispatches SILENCE_DETECTED itself, so this tap is a no-op.
          if (e instanceof Error && /not recording/i.test(e.message)) return;
          throw e;
        }
        dispatch({ type: 'SILENCE_DETECTED' });
      } catch (e) {
        setError(`stopRecording failed: ${String(e)}`);
        dispatch({ type: 'MANUAL_STOP' });
      }
    }
  };

  const ms = micStateFor(state.tag);
  const ingredients = state.context.currentIngredients;
  const last = state.context.lastResponse;
  const assistantText = last?.answer ?? last?.items?.[0]?.raw_phrase;
  const prevLenRef = useRef(ingredients.length);
  useEffect(() => {
    prevLenRef.current = ingredients.length;
  }, [ingredients.length]);
  const newestIndex = ingredients.length - 1;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.headerWrap}>
        <EditorialHeader
          eyebrow="Live session · N° 01"
          right={<SessionTimer />}
          onBack={() => router.back()}
        />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {ms ? <MicCard state={ms} assistantText={assistantText} onTap={onMicTap} /> : null}

        <SectionHeading
          title="Mise en place"
          count={ingredients.length > 0 ? ingredients.length : undefined}
        />
        {ingredients.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyIllustration size={80} />
            <Text style={styles.empty}>
              No ingredients yet.{'\n'}Tap the mic and tell me what you're using.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {ingredients.map((ing, i) => {
              const isNewest = i === newestIndex && prevLenRef.current < ingredients.length;
              return (
                <IngredientRow
                  key={`${ing.name}-${i}`}
                  name={ing.name}
                  quantity={
                    ing.qty != null ? `${ing.qty}${ing.unit ? ' ' + ing.unit : ''}` : undefined
                  }
                  last={i === ingredients.length - 1}
                  accent={isNewest ? 'gold-asterisk' : undefined}
                />
              );
            })}
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={onFinish}
          disabled={finalizeStarted || ingredients.length === 0}
          style={({ pressed }) => [
            styles.cta,
            (finalizeStarted || ingredients.length === 0) && styles.ctaDisabled,
            pressed && styles.ctaPressed,
          ]}
          accessibilityLabel="Finish cooking"
        >
          <Text style={styles.ctaText}>
            {finalizeStarted ? 'Saving' : 'Finish cooking'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function SessionTimer() {
  const start = useRef(Date.now()).current;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [start]);
  const mm = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const ss = (elapsed % 60).toString().padStart(2, '0');
  return <Text style={styles.timer}>{`${mm}:${ss}`}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  headerWrap: { paddingHorizontal: scale.xxl, paddingTop: scale.sm },
  body: { paddingHorizontal: scale.xxl, paddingTop: scale.xl, paddingBottom: scale.xxxl, gap: scale.xl },
  empty: {
    ...typography.body,
    color: colors.mutedGreen,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: scale.md,
    paddingVertical: scale.xl,
  },
  list: {
    paddingHorizontal: 0,
  },
  footer: {
    paddingHorizontal: scale.xxl,
    paddingVertical: scale.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.deepGreenOnCream,
  },
  cta: {
    backgroundColor: colors.vibrantGreen,
    borderRadius: radii.button,
    paddingVertical: scale.lg,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaPressed: { opacity: 0.85 },
  ctaText: {
    ...typography.button,
    color: colors.cream,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  timer: { ...typography.byline, color: colors.mutedGreen, fontVariant: ['tabular-nums'] },
  error: { color: colors.error, textAlign: 'center' },
});
