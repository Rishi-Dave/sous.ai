// Native (iOS/Android) implementation. Metro picks recorder.web.ts on web.
// Root CLAUDE.md rule 1: one audio consumer at a time — flip setAudioModeAsync
// between recording and playback so TTS doesn't fight the mic.
// expo-av is lazy-required inside each function so Jest's jsdom env never tries
// to load ExponentAV (which has no JS fallback).

import type { RecordedAudio, StartRecordingOptions } from './types';

const METER_INTERVAL_MS = 100;

let current: any = null;

export async function startRecording(opts: StartRecordingOptions = {}): Promise<void> {
  if (current) throw new Error('already recording');
  const { Audio } = require('expo-av');
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) throw new Error('mic permission denied');

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
  const recordingOptions = {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  };
  const onStatus = opts.onMeter
    ? (status: any) => {
        if (status.isRecording && typeof status.metering === 'number') {
          opts.onMeter!(status.metering, status.durationMillis ?? 0);
        }
      }
    : null;
  const { recording } = await Audio.Recording.createAsync(
    recordingOptions,
    onStatus,
    METER_INTERVAL_MS,
  );
  current = recording;
}

export async function stopRecording(): Promise<RecordedAudio> {
  if (!current) throw new Error('not recording');
  const { Audio } = require('expo-av');
  const rec = current;
  current = null;
  await rec.stopAndUnloadAsync();
  const uri = rec.getURI();
  if (!uri) throw new Error('recording produced no URI');
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
  });
  return { uri, mime: 'audio/m4a' };
}

export async function cancelRecording(): Promise<void> {
  if (!current) return;
  const { Audio } = require('expo-av');
  const rec = current;
  current = null;
  try {
    await rec.stopAndUnloadAsync();
  } catch {
    // already stopped — harmless
  }
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
  });
}
