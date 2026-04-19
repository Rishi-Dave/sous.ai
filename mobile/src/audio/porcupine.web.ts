// Web no-op — Porcupine is iOS/Android only. The manual Wake button in App.tsx
// is the web-side fallback, so wake-word detection silently does nothing here.

export async function armPorcupine(_onWake: () => void): Promise<void> {
  return;
}

export async function disarmPorcupine(): Promise<void> {
  return;
}
