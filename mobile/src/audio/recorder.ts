// Native (iOS/Android) implementation. Metro picks recorder.web.ts on web.
// Root CLAUDE.md rule 1: one audio consumer at a time — flip setAudioModeAsync
// between recording and playback so TTS doesn't fight the mic.
// expo-av is lazy-required inside each function so Jest's jsdom env never tries
// to load ExponentAV (which has no JS fallback).

import type { RecordedAudio } from './types';

let current: any = null;

export async function startRecording(): Promise<void> {
  if (current) throw new Error('already recording');
  const { Audio } = require('expo-av');
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) throw new Error('mic permission denied');

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY,
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
