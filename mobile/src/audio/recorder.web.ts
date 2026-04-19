// Web MediaRecorder implementation. Metro picks this over recorder.ts on web.
// Root CLAUDE.md rule 1: one audio consumer at a time — release the stream on stop/cancel.
// `onMeter` from StartRecordingOptions is accepted but ignored — MediaRecorder
// has no built-in metering and we rely on the manual Stop button on web.

import type { RecordedAudio, StartRecordingOptions } from './types';

let mediaRecorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let stopPromise: Promise<Blob> | null = null;

export async function startRecording(_opts: StartRecordingOptions = {}): Promise<void> {
  if (mediaRecorder) throw new Error('already recording');
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  stopPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      const mime = recorder.mimeType || 'audio/webm';
      resolve(new Blob(chunks, { type: mime }));
    };
  });
  mediaRecorder = recorder;
  recorder.start();
}

export async function stopRecording(): Promise<RecordedAudio> {
  if (!mediaRecorder || !stopPromise) throw new Error('not recording');
  const recorder = mediaRecorder;
  const pending = stopPromise;
  recorder.stop();
  const blob = await pending;
  releaseStream();
  return blob;
}

export async function cancelRecording(): Promise<void> {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  releaseStream();
}

function releaseStream(): void {
  stream?.getTracks().forEach((t) => t.stop());
  mediaRecorder = null;
  stream = null;
  stopPromise = null;
  chunks = [];
}
