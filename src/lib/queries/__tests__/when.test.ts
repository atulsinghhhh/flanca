import { describe, expect, it } from "vitest";
import { isoDay, resolveDay, schoolToday } from "../when";

/**
 * These exist because the bug they describe was live: the app derived "today" in
 * UTC, so on a UTC server every night between midnight and 05:30 IST it showed the
 * previous day — a receipt dated a day early, and an attendance sheet that opened
 * on yesterday.
 */

/** 01:30 IST on 20 August — inside the window that used to be wrong. */
const EARLY_MORNING_IST = new Date("2026-08-19T20:00:00Z");
/** 06:30 IST on 20 August — outside it. */
const AFTER_DAWN_IST = new Date("2026-08-20T01:00:00Z");

describe("isoDay — the day the school is actually in", () => {
  it("still says today at half past one in the morning", () => {
    expect(isoDay(EARLY_MORNING_IST)).toBe("2026-08-20");
    // The expression this replaced: EARLY_MORNING_IST.toISOString() → "2026-08-19"
    expect(EARLY_MORNING_IST.toISOString().slice(0, 10)).toBe("2026-08-19");
  });

  it("agrees with UTC during school hours", () => {
    expect(isoDay(AFTER_DAWN_IST)).toBe("2026-08-20");
  });

  it("leaves a date-only value alone, because IST is ahead of UTC and never behind", () => {
    expect(isoDay(new Date("2026-04-01T00:00:00Z"))).toBe("2026-04-01");
    expect(isoDay(new Date("2027-03-31T00:00:00Z"))).toBe("2027-03-31");
  });

  it("does not slip a day at the end of a month", () => {
    expect(isoDay(new Date("2026-08-31T19:00:00Z"))).toBe("2026-09-01");
  });
});

describe("schoolToday — midnight UTC of the school's day", () => {
  it("is the shape every date column in this schema uses", () => {
    const day = schoolToday(EARLY_MORNING_IST);
    expect(day.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });
});

describe("resolveDay — a URL is not a trusted input", () => {
  it("takes a good date as given", () => {
    expect(resolveDay("2026-08-10").toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("never returns a day that has not happened", () => {
    const future = resolveDay("2030-01-01");
    expect(future.getTime()).toBe(schoolToday().getTime());
  });

  it("falls back to today rather than throwing on nonsense", () => {
    expect(resolveDay("not-a-date").getTime()).toBe(schoolToday().getTime());
    expect(resolveDay("").getTime()).toBe(schoolToday().getTime());
  });
});
