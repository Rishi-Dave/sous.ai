// TTS playback. Web uses HTMLAudioElement; native uses expo-av Audio.Sound.
// Single-file runtime branch via isWeb() — Jest tests mock each path independently.
// expo-av is lazy-required inside the native branch so web bundles / jsdom tests
// never try to load ExponentAV (which has no JS fallback).
// Caller resolves relative URLs (e.g. "/tts/stream/<id>") against the backend base.

type Disposable = { resolve: () => void; dispose: () => void };

let currentControl: Disposable | null = null;

function isWeb(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as any).Audio === 'function';
}

export function playAck(url: string): Promise<void> {
  if (!isWeb()) return playAckNative(url);
  return playAckWeb(url);
}

export function stopAck(): void {
  const c = currentControl;
  if (!c) return;
  currentControl = null;
  c.dispose();
  c.resolve();
}

function playAckWeb(url: string): Promise<void> {
  // Preempt any prior playback so the state machine never doubles up.
  stopAck();

  return new Promise<void>((resolve, reject) => {
    const AudioCtor = (globalThis as any).Audio as { new (): HTMLAudioElement };
    const audio = new AudioCtor();

    const dispose = () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      try {
        audio.pause();
        audio.src = '';
      } catch {
        // ignore — the element may already be detached
      }
    };
    const onEnded = () => {
      if (currentControl === control) currentControl = null;
      dispose();
      resolve();
    };
    const onError = () => {
      if (currentControl === control) currentControl = null;
      dispose();
      reject(new Error('playback failed'));
    };

    const control: Disposable = { resolve, dispose };
    currentControl = control;

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.src = url;
    const p = audio.play();
    if (p && typeof (p as Promise<void>).catch === 'function') {
      (p as Promise<void>).catch((e: unknown) => {
        if (currentControl === control) currentControl = null;
        dispose();
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    }
  });
}

function playAckNative(url: string): Promise<void> {
  stopAck();

  return new Promise<void>((resolve, reject) => {
    // Lazy-require so the web/jsdom Jest environment never tries to load ExponentAV.
    const { Audio } = require('expo-av');

    let sound: any = null;
    let settled = false;

    const dispose = () => {
      if (!sound) return;
      const s = sound;
      sound = null;
      s.unloadAsync().catch(() => {});
    };
    const control: Disposable = { resolve, dispose };
    currentControl = control;

    const onStatus = (status: any) => {
      if (settled) return;
      if (!status.isLoaded) {
        if (status.error) {
          settled = true;
          if (currentControl === control) currentControl = null;
          dispose();
          reject(new Error(String(status.error)));
        }
        return;
      }
      if (status.didJustFinish) {
        settled = true;
        if (currentControl === control) currentControl = null;
        dispose();
        resolve();
      }
    };

    Audio.Sound.createAsync({ uri: url }, { shouldPlay: true }, onStatus)
      .then(({ sound: s }: { sound: any }) => {
        if (settled) {
          // stopAck() fired before the sound loaded — release it.
          s.unloadAsync().catch(() => {});
          return;
        }
        sound = s;
      })
      .catch((e: unknown) => {
        if (settled) return;
        settled = true;
        if (currentControl === control) currentControl = null;
        reject(e instanceof Error ? e : new Error(String(e)));
      });
  });
}
