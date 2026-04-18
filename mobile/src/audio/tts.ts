// TODO(rh/tts): replace with expo-av Sound.createAsync when integrating ElevenLabs.
// Backend returns `ack_audio_url` — on phone, fetch + play. On web/mock, simulate playback.

export function playAck(_url: string): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 500);
  });
}
