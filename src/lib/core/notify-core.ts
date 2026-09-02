/**
 * Whether a push should actually go out right now. Pure — no clock, no
 * database, so it can be tested exactly like every other rule in this product.
 *
 * The in-app `Notification` row is written regardless of any of this; this
 * function only ever decides whether the device in someone's pocket buzzes.
 * Nothing here can lose a notification, only delay how loudly it arrives.
 */

export type QuietHours = { start: number | null; end: number | null };

/**
 * Whether `hour` (0-23) falls inside a quiet-hours window. An end before a
 * start is a window that crosses midnight — 22 to 7 means quiet from ten at
 * night to seven the next morning, not an empty range.
 */
export function isQuietHour(hour: number, quiet: QuietHours): boolean {
  if (quiet.start == null || quiet.end == null) return false;
  const { start, end } = quiet;
  if (start === end) return false; // a zero-width window is not a window
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function shouldSendPush(params: {
  pushEnabled: boolean;
  quiet: QuietHours;
  currentHour: number;
}): boolean {
  if (!params.pushEnabled) return false;
  return !isQuietHour(params.currentHour, params.quiet);
}

/** A quiet-hours pair worth saving — both set, or both cleared, never one alone. */
export function validateQuietHours(start: number | null, end: number | null): { ok: boolean; error: string | null } {
  const has = (v: number | null) => v != null;
  if (has(start) !== has(end)) {
    return { ok: false, error: "Set both a start and an end hour, or clear both." };
  }
  const inRange = (v: number | null) => v == null || (Number.isInteger(v) && v >= 0 && v <= 23);
  if (!inRange(start) || !inRange(end)) {
    return { ok: false, error: "Hours run 0 to 23." };
  }
  return { ok: true, error: null };
}
