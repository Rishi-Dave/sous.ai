// Native (iOS/Android) Porcupine wake-word listener. Metro picks porcupine.web.ts on web.
// Root CLAUDE.md rule 1: only one audio consumer at a time. Porcupine holds the mic
// in Armed; it must be stopped before expo-av starts recording.
//
// PorcupineManager and expo-asset are lazy-required inside function bodies so Jest's
// jsdom env never tries to load the native modules at import time, and so the manager
// itself is only created on first arm (avoiding a heavy native init at app launch).
//
// Re-arm pattern: a single PorcupineManager singleton survives across arm/disarm cycles
// (model reload would cost ~1s). The detection callback indirects through `currentOnWake`,
// so swapping callbacks across cycles is free.

const SENSITIVITY = 0.5;

let manager: any = null;
let currentOnWake: (() => void) | null = null;

async function ensureManager(): Promise<any> {
  if (manager) return manager;

  const accessKey = process.env.EXPO_PUBLIC_PICOVOICE_ACCESS_KEY;
  if (!accessKey) {
    throw new Error('EXPO_PUBLIC_PICOVOICE_ACCESS_KEY missing — set it in mobile/.env');
  }

  const { PorcupineManager } = require('@picovoice/porcupine-react-native');
  const { Asset } = require('expo-asset');

  const asset = Asset.fromModule(require('../../assets/hey_sous.ppn'));
  await asset.downloadAsync();
  const localUri: string = asset.localUri ?? asset.uri;
  const keywordPath = localUri.startsWith('file://') ? localUri.slice('file://'.length) : localUri;

  manager = await PorcupineManager.fromKeywordPaths(
    accessKey,
    [keywordPath],
    (_keywordIndex: number) => {
      currentOnWake?.();
    },
    undefined,
    undefined,
    undefined,
    [SENSITIVITY],
  );
  return manager;
}

export async function armPorcupine(onWake: () => void): Promise<void> {
  currentOnWake = onWake;
  const m = await ensureManager();
  await m.start();
}

export async function disarmPorcupine(): Promise<void> {
  currentOnWake = null;
  if (!manager) return;
  await manager.stop();
}
