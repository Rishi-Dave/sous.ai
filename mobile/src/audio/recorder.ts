// TODO(rh/mic-vad): wire expo-av Audio.Recording in a later branch.
// See docs/design.md §4 (Listening state) and root CLAUDE.md architecture rule 1.

export async function startRecording(): Promise<void> {
  return;
}

export async function stopRecording(): Promise<Blob> {
  return new Blob([], { type: 'audio/wav' });
}
