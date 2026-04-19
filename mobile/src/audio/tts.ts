// Web-only playback this branch. Native path stays stubbed — phone work replaces it
// with expo-av Sound.createAsync in a later branch.
// Caller resolves relative URLs (e.g. "/tts/stream/<id>") against the backend base.

type Disposable = { resolve: () => void; dispose: () => void };

let currentControl: Disposable | null = null;

function isWeb(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as any).Audio === 'function';
}

export function playAck(url: string): Promise<void> {
  if (!isWeb()) {
    return new Promise((resolve) => setTimeout(resolve, 500));
  }

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

export function stopAck(): void {
  const c = currentControl;
  if (!c) return;
  currentControl = null;
  c.dispose();
  c.resolve();
}
