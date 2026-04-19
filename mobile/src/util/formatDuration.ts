// Render a duration as "Xm Ys" (or "Xs" under a minute) for cookbook + summary.
// Returns null for null/undefined input so callers can branch on presence.
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

// Render a relative date ("2h ago", "yesterday", "apr 17") for cookbook entries.
export function formatRelativeDate(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const deltaMs = now - t;
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const d = new Date(t);
  return d
    .toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
    .toLowerCase();
}
