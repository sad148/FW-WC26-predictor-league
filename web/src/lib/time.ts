/**
 * Time helpers. Storage is always UTC (Postgres timestamptz, JS ISO strings).
 * Display is always in the user's local timezone (browser default).
 */

/** UTC ISO string → "YYYY-MM-DDTHH:mm" suitable for <input type="datetime-local"> in the user's tz. */
export function utcToLocalInput(utcIso: string | null | undefined): string {
  if (!utcIso) return '';
  const d = new Date(utcIso);
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

/** datetime-local input value (interpreted as user's local tz) → UTC ISO string, or null if empty. */
export function localInputToUtc(localValue: string): string | null {
  if (!localValue) return null;
  const d = new Date(localValue);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** UTC ISO → human-readable string in the user's local timezone. */
export function formatLocal(utcIso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!utcIso) return '—';
  return new Date(utcIso).toLocaleString(undefined, opts ?? {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** Derived match lifecycle: pure function of (now, startTime, endTime, scoreA, scoreB). */
export type MatchState = 'unscheduled' | 'scheduled' | 'open' | 'closed' | 'complete';

export function matchState(
  m: { startTime: string | null; endTime: string | null; scoreA: number | null; scoreB: number | null },
  now: number = Date.now(),
): MatchState {
  if (m.scoreA !== null && m.scoreB !== null) return 'complete';
  if (!m.startTime || !m.endTime) return 'unscheduled';
  const start = new Date(m.startTime).getTime();
  const end   = new Date(m.endTime).getTime();
  if (now < start) return 'scheduled';
  if (now < end)   return 'open';
  return 'closed';
}

export const MATCH_STATE_LABEL: Record<MatchState, string> = {
  unscheduled: 'TIMES NOT SET',
  scheduled:   'OPENS SOON',
  open:        '● OPEN',
  closed:      'AWAITING RESULT',
  complete:    '✓ FINAL',
};
