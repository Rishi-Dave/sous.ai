/** Picovoice Porcupine: opt-in only (requires dev build + native module + access key). */
export function usePicovoicePorcupine(): boolean {
  const enabled = process.env.EXPO_PUBLIC_USE_PORCUPINE === 'true';
  const key = process.env.EXPO_PUBLIC_PICOVOICE_ACCESS_KEY?.trim();
  return enabled && !!key;
}

/**
 * Hands-free wake via backend Groq Whisper on short mic chunks.
 * Disabled when Porcupine is active (single path in Armed).
 * Default on (native); set EXPO_PUBLIC_USE_GROQ_WAKE_PROBE=false to disable.
 */
export function useGroqWakeProbe(): boolean {
  if (usePicovoicePorcupine()) return false;
  return process.env.EXPO_PUBLIC_USE_GROQ_WAKE_PROBE !== 'false';
}
