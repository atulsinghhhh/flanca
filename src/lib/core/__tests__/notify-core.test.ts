import { describe, expect, it } from "vitest";
import { isQuietHour, shouldSendPush, validateQuietHours } from "../notify-core";

describe("isQuietHour", () => {
  it("is never quiet when neither bound is set", () => {
    expect(isQuietHour(2, { start: null, end: null })).toBe(false);
  });

  it("handles an ordinary same-day window", () => {
    expect(isQuietHour(13, { start: 12, end: 14 })).toBe(true);
    expect(isQuietHour(11, { start: 12, end: 14 })).toBe(false);
    expect(isQuietHour(14, { start: 12, end: 14 })).toBe(false); // end is exclusive
  });

  it("handles a window crossing midnight", () => {
    const quiet = { start: 22, end: 7 };
    expect(isQuietHour(23, quiet)).toBe(true);
    expect(isQuietHour(3, quiet)).toBe(true);
    expect(isQuietHour(7, quiet)).toBe(false);
    expect(isQuietHour(21, quiet)).toBe(false);
  });

  it("treats a zero-width window as no window at all", () => {
    expect(isQuietHour(9, { start: 9, end: 9 })).toBe(false);
  });
});

describe("shouldSendPush", () => {
  it("refuses when push is off, regardless of the hour", () => {
    expect(shouldSendPush({ pushEnabled: false, quiet: { start: null, end: null }, currentHour: 10 })).toBe(false);
  });

  it("sends when push is on and it is not quiet", () => {
    expect(shouldSendPush({ pushEnabled: true, quiet: { start: 22, end: 7 }, currentHour: 10 })).toBe(true);
  });

  it("withholds during quiet hours even with push on", () => {
    expect(shouldSendPush({ pushEnabled: true, quiet: { start: 22, end: 7 }, currentHour: 23 })).toBe(false);
  });
});

describe("validateQuietHours", () => {
  it("accepts both cleared", () => {
    expect(validateQuietHours(null, null).ok).toBe(true);
  });

  it("accepts both set", () => {
    expect(validateQuietHours(22, 7).ok).toBe(true);
  });

  it("refuses one without the other", () => {
    expect(validateQuietHours(22, null).ok).toBe(false);
    expect(validateQuietHours(null, 7).ok).toBe(false);
  });

  it("refuses an hour out of range", () => {
    expect(validateQuietHours(-1, 7).ok).toBe(false);
    expect(validateQuietHours(22, 24).ok).toBe(false);
  });
});
