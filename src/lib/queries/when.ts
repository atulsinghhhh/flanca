/**
 * What day is it, for a school in India?
 *
 * Not a pedantic question. `new Date().toISOString().slice(0, 10)` gives the day
 * in UTC, and India is five and a half hours ahead — so every night between
 * midnight and 05:30 IST that expression returns YESTERDAY. On a server in UTC,
 * which is where this will be hosted, that produced three real faults:
 *
 *  - a receipt dated the previous day, which is exactly what an auditor catches;
 *  - a date picker whose `max` was yesterday, so a clerk could not choose today;
 *  - worse, an attendance sheet that opened on yesterday, meaning an early
 *    morning mark was written against the wrong day — and the offline sync key
 *    carries the date, so the correction would not overwrite it either.
 *
 * Every calendar day in this product is therefore derived here, in the school's
 * own timezone, and stored as midnight UTC — which is the shape every date column
 * already uses, and which is safe because IST is ahead of UTC, never behind.
 */

/** India only in v1 (docs/STATUS.md). When that changes, this becomes a school setting. */
export const SCHOOL_TZ = "Asia/Kolkata";

const DAY_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: SCHOOL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** A calendar day written the way a date input wants it: YYYY-MM-DD, in Indian time. */
export function isoDay(d: Date = new Date()): string {
  const parts = DAY_PARTS.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Midnight UTC of the school's current day. */
export function schoolToday(now: Date = new Date()): Date {
  return new Date(`${isoDay(now)}T00:00:00Z`);
}

const HOUR_PART = new Intl.DateTimeFormat("en-GB", { timeZone: SCHOOL_TZ, hour: "2-digit", hour12: false });

/** The hour of day, 0-23, in the school's own timezone — what quiet hours are measured against. */
export function currentHourIST(now: Date = new Date()): number {
  const hour = HOUR_PART.formatToParts(now).find((p) => p.type === "hour")?.value ?? "0";
  return Number(hour) % 24; // en-GB's "24" at midnight would otherwise read as tomorrow
}

/**
 * Resolve a ?date= query value to a real day.
 *
 * Anything unparseable or in the future collapses to today: a school must never
 * be shown an "attendance sheet" for a day that has not happened, and a URL is
 * not a trusted input.
 */
export function resolveDay(input?: string): Date {
  const today = schoolToday();
  if (!input) return today;

  const parsed = new Date(`${input}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return today;

  const day = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  return day.getTime() > today.getTime() ? today : day;
}
