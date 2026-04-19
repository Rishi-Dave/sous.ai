import { formatDuration, formatRelativeDate } from '../formatDuration';

describe('formatDuration', () => {
  it('returns null for null/undefined/negative/NaN input', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(-5)).toBeNull();
    expect(formatDuration(NaN)).toBeNull();
  });

  it('renders seconds-only for durations under a minute', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(42)).toBe('42s');
  });

  it('renders a bare "Xm" when seconds are zero', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(1800)).toBe('30m');
  });

  it('renders "Xm Ys" when both components are present', () => {
    expect(formatDuration(420)).toBe('7m');
    expect(formatDuration(425)).toBe('7m 5s');
    expect(formatDuration(3661)).toBe('61m 1s');
  });
});

describe('formatRelativeDate', () => {
  const now = new Date('2026-04-19T12:00:00Z').getTime();

  it('returns em-dash for null/undefined/invalid', () => {
    expect(formatRelativeDate(null, now)).toBe('—');
    expect(formatRelativeDate(undefined, now)).toBe('—');
    expect(formatRelativeDate('not a date', now)).toBe('—');
  });

  it('renders minutes + hours for same-day entries', () => {
    expect(formatRelativeDate(new Date(now - 30 * 1000).toISOString(), now)).toBe('just now');
    expect(formatRelativeDate(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5m ago');
    expect(formatRelativeDate(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3h ago');
  });

  it('renders "yesterday" for 24-47h old entries', () => {
    expect(formatRelativeDate(new Date(now - 26 * 3_600_000).toISOString(), now)).toBe(
      'yesterday',
    );
  });

  it('renders month/day for entries older than a week', () => {
    const older = new Date('2026-03-15T10:00:00Z').getTime();
    const out = formatRelativeDate(new Date(older).toISOString(), now);
    expect(out).toMatch(/^mar\s+15$/);
  });
});
