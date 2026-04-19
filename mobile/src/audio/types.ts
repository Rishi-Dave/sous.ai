export type NativeRecording = { uri: string; mime: string };

export type RecordedAudio = Blob | NativeRecording;

export function isNativeRecording(audio: RecordedAudio): audio is NativeRecording {
  return typeof audio === 'object' && audio !== null && 'uri' in audio && 'mime' in audio;
}
