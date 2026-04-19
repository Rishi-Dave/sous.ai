import { shouldStop } from '../vad';

// Helper: build a series of readings every 100ms starting at t=0.
const series = (...db: number[]): Array<{ db: number; t: number }> =>
  db.map((d, i) => ({ db: d, t: i * 100 }));

describe('shouldStop — pure VAD function', () => {
  it('returns false on empty buffer', () => {
    expect(shouldStop([])).toBe(false);
  });

  it('returns false when only a single reading exists (no time window)', () => {
    expect(shouldStop([{ db: -60, t: 0 }])).toBe(false);
  });

  it('returns false when the trailing window is loud', () => {
    // 16 readings × 100ms = 1500ms span, all above threshold.
    const readings = series(...new Array(16).fill(-20));
    expect(shouldStop(readings)).toBe(false);
  });

  it('returns true when the trailing 1.5s is fully silent (no loud reading at all)', () => {
    // 16 readings × 100ms span = 1500ms, all below -40 dB.
    const readings = series(...new Array(16).fill(-60));
    expect(shouldStop(readings)).toBe(true);
  });

  it('returns false when the silent span is just under 1.5s', () => {
    // 15 readings × 100ms span = 1400ms. 1400 < 1500 → false.
    const readings = series(...new Array(15).fill(-60));
    expect(shouldStop(readings)).toBe(false);
  });

  it('returns true when 1.5s of trailing silence follows a loud burst', () => {
    // Loud at t=0, quiet from t=100..t=1600 (16 quiet readings spanning 1500ms after loud).
    const readings = [
      { db: -10, t: 0 },
      ...new Array(16).fill(0).map((_, i) => ({ db: -55, t: 100 + i * 100 })),
    ];
    expect(shouldStop(readings)).toBe(true);
  });

  it('returns false when a loud reading reappears at the tail (mid-sentence pause case)', () => {
    // Loud t=0, quiet t=100..t=1500 (under window), loud again at t=1600.
    const readings = [
      { db: -10, t: 0 },
      ...new Array(15).fill(0).map((_, i) => ({ db: -55, t: 100 + i * 100 })),
      { db: -10, t: 1600 },
    ];
    expect(shouldStop(readings)).toBe(false);
  });

  it('respects a custom thresholdDb', () => {
    // -30 dB readings are "loud" at default threshold -40 but "quiet" at threshold -20.
    const readings = series(...new Array(16).fill(-30));
    expect(shouldStop(readings)).toBe(false);
    expect(shouldStop(readings, { thresholdDb: -20 })).toBe(true);
  });

  it('respects a custom silenceMs window', () => {
    // 1500ms of quiet — true at default 1500, false at 2500.
    const readings = series(...new Array(16).fill(-60));
    expect(shouldStop(readings, { silenceMs: 1500 })).toBe(true);
    expect(shouldStop(readings, { silenceMs: 2500 })).toBe(false);
  });
});
