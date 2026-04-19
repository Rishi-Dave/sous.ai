// Voice activity detection — pure function, no expo-av imports so it's unit-testable.
// Treats a reading at or above `thresholdDb` as voiced. Returns true when the
// trailing window of duration `silenceMs` contains no voiced readings AND the
// buffer spans at least `silenceMs` of wall-clock time.
//
// Defaults match design doc §4 (revised to 1.5s for "hey sous"). Tune per demo
// environment. The 10s hard cap lives in App.tsx, not here.

export interface MeterReading {
  db: number;
  t: number;
}

export interface ShouldStopOptions {
  thresholdDb?: number;
  silenceMs?: number;
}

const DEFAULT_THRESHOLD_DB = -40;
const DEFAULT_SILENCE_MS = 1500;

export function shouldStop(
  readings: ReadonlyArray<MeterReading>,
  opts: ShouldStopOptions = {},
): boolean {
  if (readings.length === 0) return false;
  const thresholdDb = opts.thresholdDb ?? DEFAULT_THRESHOLD_DB;
  const silenceMs = opts.silenceMs ?? DEFAULT_SILENCE_MS;

  const now = readings[readings.length - 1].t;

  for (let i = readings.length - 1; i >= 0; i--) {
    if (readings[i].db >= thresholdDb) {
      return now - readings[i].t >= silenceMs;
    }
  }

  return now - readings[0].t >= silenceMs;
}
