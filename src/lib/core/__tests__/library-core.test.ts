import { describe, expect, it } from "vitest";
import { canIssue, daysOverdue, dueDateFor, fineFor, isValidIsbn, MAX_FINE } from "../library-core";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("loan dates", () => {
  it("gives a fortnight", () => {
    expect(dueDateFor(d("2026-08-01")).toISOString().slice(0, 10)).toBe("2026-08-15");
  });

  it("counts overdue days only after the due date", () => {
    expect(daysOverdue(d("2026-08-15"), d("2026-08-15"))).toBe(0);
    expect(daysOverdue(d("2026-08-15"), d("2026-08-10"))).toBe(0);
    expect(daysOverdue(d("2026-08-15"), d("2026-08-20"))).toBe(5);
  });
});

describe("fineFor", () => {
  it("charges nothing for a book returned on time", () => {
    expect(fineFor(d("2026-08-15"), d("2026-08-14"), d("2026-08-20"))).toBe(0);
    expect(fineFor(d("2026-08-15"), d("2026-08-15"), d("2026-08-20"))).toBe(0);
  });

  it("charges per day late", () => {
    expect(fineFor(d("2026-08-15"), d("2026-08-20"), d("2026-08-25"))).toBe(1000);
  });

  it("uses today for a book still out", () => {
    expect(fineFor(d("2026-08-15"), null, d("2026-08-18"))).toBe(600);
  });

  it("never exceeds the cap", () => {
    expect(fineFor(d("2025-01-01"), null, d("2026-08-18"))).toBe(MAX_FINE);
  });
});

describe("canIssue — the librarian needs the reason, not a silent refusal", () => {
  it("allows a normal issue", () => {
    expect(canIssue({ availableCopies: 2, openLoans: 1, unpaidFines: 0 })).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it("refuses when nothing is on the shelf", () => {
    expect(canIssue({ availableCopies: 0, openLoans: 0, unpaidFines: 0 }).reason).toMatch(/on the shelf/);
  });

  it("refuses past the book limit and says the count", () => {
    const r = canIssue({ availableCopies: 5, openLoans: 3, unpaidFines: 0 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/already has 3 books out \(limit 3\)/i);
  });

  it("refuses with an unpaid fine", () => {
    expect(canIssue({ availableCopies: 5, openLoans: 0, unpaidFines: 500 }).reason).toMatch(/unpaid fine/);
  });
});

describe("isValidIsbn — catch a mistyped number at the desk", () => {
  it("accepts real ISBN-13 and ISBN-10", () => {
    expect(isValidIsbn("978-0-306-40615-7")).toBe(true);
    expect(isValidIsbn("9780306406157")).toBe(true);
    expect(isValidIsbn("0-306-40615-2")).toBe(true);
    expect(isValidIsbn("080442957X")).toBe(true);
  });

  it("rejects a bad checksum or wrong length", () => {
    expect(isValidIsbn("9780306406158")).toBe(false);
    expect(isValidIsbn("12345")).toBe(false);
    expect(isValidIsbn("")).toBe(false);
  });
});
