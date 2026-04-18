// Native stub. The web implementation lives in recorder.web.ts; Metro resolves
// that on web, this on native. Phone wiring (expo-av Audio.Recording) lands in rh/phone-mic.
// See docs/design.md §4 and root CLAUDE.md architecture rule 1.

export async function startRecording(): Promise<void> {
  return;
}

export async function stopRecording(): Promise<Blob> {
  return new Blob([], { type: 'audio/wav' });
}

export async function cancelRecording(): Promise<void> {
  return;
}
