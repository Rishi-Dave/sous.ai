export type NativeRecording = { uri: string; mime: string };

export type RecordedAudio = Blob | NativeRecording;

export function isNativeRecording(audio: RecordedAudio): audio is NativeRecording {
  return typeof audio === 'object' && audio !== null && 'uri' in audio && 'mime' in audio;
}

// Per-progress-tick metering callback. `dbfs` is the loudness floor reported by
// expo-av (≤0; quieter is more negative). `tMs` is monotonic ms since recording start.
// Web ignores this callback — MediaRecorder doesn't expose metering.
export type MeterCallback = (dbfs: number, tMs: number) => void;

export interface StartRecordingOptions {
  onMeter?: MeterCallback;
}
