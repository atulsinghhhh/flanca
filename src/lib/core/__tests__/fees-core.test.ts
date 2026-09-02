import { describe, expect, it } from "vitest";
import {
  ageBucket,
  buildInvoice,
  lateFineFor,
  outstandingOf,
  splitEvenly,
  statusAfterPayment,
  summariseDues,
  planTermBilling,
} from "../fees-core";
import { paise } from "../money";

const LINES = [
  { head: "Tuition Fee", amount: paise(30000) },
  { head: "Transport", amount: paise(8000) },
  { head: "Lab", amount: paise(4000) },
];

describe("buildInvoice", () => {
  it("itemises head-wise and totals correctly with no concession", () => {
    const inv = buildInvoice({ lines: LINES });
    expect(inv.gross).toBe(paise(42000));
    expect(inv.concession).toBe(0);
    expect(inv.net).toBe(paise(42000));
    expect(inv.lines).toHaveLength(3);
  });

  it("applies a percentage concession per head", () => {
    const inv = buildInvoice({
      lines: LINES,
      concessions: [{ percentage: 10, heads: ["Tuition Fee"] }],
    });
    expect(inv.concession).toBe(paise(3000));
    expect(inv.net).toBe(paise(39000));
    expect(inv.lines.find((l) => l.head === "Tuition Fee")!.concession).toBe(paise(3000));
    expect(inv.lines.find((l) => l.head === "Transport")!.concession).toBe(0);
  });

  it("spreads a fixed concession largest-head-first and never over-credits", () => {
    const inv = buildInvoice({
      lines: [
        { head: "Tuition Fee", amount: paise(1000) },
        { head: "Lab", amount: paise(500) },
      ],
      concessions: [{ fixedAmount: paise(1200) }],
    });
    expect(inv.concession).toBe(paise(1200));
    expect(inv.lines.find((l) => l.head === "Tuition Fee")!.concession).toBe(paise(1000));
    expect(inv.lines.find((l) => l.head === "Lab")!.concession).toBe(paise(200));
  });

  it("cannot discount more than is owed", () => {
    const inv = buildInvoice({
      lines: [{ head: "Tuition Fee", amount: paise(1000) }],
      concessions: [{ fixedAmount: paise(5000) }],
    });
    expect(inv.concession).toBe(paise(1000));
    expect(inv.net).toBe(0);
  });

  it("scales by installment share", () => {
    const inv = buildInvoice({ lines: LINES, share: 0.25 });
    expect(inv.gross).toBe(paise(10500));
  });

  it("adds late fee to the net", () => {
    const inv = buildInvoice({ lines: LINES, lateFee: paise(200) });
    expect(inv.net).toBe(paise(42200));
  });
});

describe("splitEvenly — four terms must re-add to the annual total", () => {
  it("loses no paise", () => {
    const parts = splitEvenly(paise(42000) + 3, 4);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(paise(42000) + 3);
    expect(parts).toHaveLength(4);
  });

  it("returns nothing for zero parts", () => {
    expect(splitEvenly(100, 0)).toEqual([]);
  });
});

describe("lateFineFor", () => {
  const rule = { graceDays: 5, perDayAmount: paise(10), flatAmount: paise(50), maxAmount: paise(500) };

  it("charges nothing inside the grace period", () => {
    const fine = lateFineFor({
      dueDate: new Date("2026-08-01"),
      asOf: new Date("2026-08-05"),
      outstanding: paise(10000),
      rule,
    });
    expect(fine).toBe(0);
  });

  it("charges flat plus per-day after grace", () => {
    const fine = lateFineFor({
      dueDate: new Date("2026-08-01"),
      asOf: new Date("2026-08-11"),
      outstanding: paise(10000),
      rule,
    });
    expect(fine).toBe(paise(50) + paise(10) * 5);
  });

  it("respects the cap", () => {
    const fine = lateFineFor({
      dueDate: new Date("2026-01-01"),
      asOf: new Date("2026-08-01"),
      outstanding: paise(10000),
      rule,
    });
    expect(fine).toBe(paise(500));
  });

  it("never exceeds the outstanding amount", () => {
    const fine = lateFineFor({
      dueDate: new Date("2026-01-01"),
      asOf: new Date("2026-08-01"),
      outstanding: paise(100),
      rule,
    });
    expect(fine).toBe(paise(100));
  });

  it("charges nothing with no policy or nothing owed", () => {
    expect(lateFineFor({ dueDate: new Date(), asOf: new Date(), outstanding: 100, rule: null })).toBe(0);
    expect(lateFineFor({ dueDate: new Date("2026-01-01"), asOf: new Date("2026-08-01"), outstanding: 0, rule })).toBe(0);
  });
});

describe("payment status and dues", () => {
  it("maps paid amount to status", () => {
    expect(statusAfterPayment(1000, 0)).toBe("UNPAID");
    expect(statusAfterPayment(1000, 400)).toBe("PARTIAL");
    expect(statusAfterPayment(1000, 1000)).toBe("PAID");
    expect(statusAfterPayment(1000, 1200)).toBe("PAID");
  });

  it("treats a cancelled invoice as owing nothing", () => {
    expect(outstandingOf({ amount: 1000, paidAmount: 0, status: "CANCELLED", dueDate: new Date() })).toBe(0);
  });

  it("buckets dues by age", () => {
    expect(ageBucket(0)).toBe("CURRENT");
    expect(ageBucket(20)).toBe("1-30");
    expect(ageBucket(45)).toBe("31-60");
    expect(ageBucket(75)).toBe("61-90");
    expect(ageBucket(200)).toBe("90+");
  });

  it("summarises a defaulter list", () => {
    const asOf = new Date("2026-08-19");
    const s = summariseDues(
      [
        { amount: paise(10000), paidAmount: 0, status: "UNPAID", dueDate: new Date("2026-08-25") },
        { amount: paise(5000), paidAmount: paise(1000), status: "PARTIAL", dueDate: new Date("2026-07-01") },
        { amount: paise(9000), paidAmount: paise(9000), status: "PAID", dueDate: new Date("2026-06-01") },
      ],
      asOf,
    );
    expect(s.total).toBe(paise(14000));
    expect(s.overdue).toBe(paise(4000));
    expect(s.buckets["CURRENT"]).toBe(paise(10000));
    expect(s.buckets["31-60"]).toBe(paise(4000));
  });
});

describe("planTermBilling — what raising a term would actually bill", () => {
  const lines = [{ head: "Tuition Fee", amount: 4000000 }, { head: "Library", amount: 60000 }];
  const one = (over: Partial<import("../fees-core").BillingCandidate> = {}) => ({
    studentId: "s1", name: "A", className: "Class 10", lines, alreadyRaised: false, eligible: true, ...over,
  });

  it("bills a quarter of the annual fee per term", () => {
    const plan = planTermBilling({ candidates: [one()], share: 0.25 });
    expect(plan.toRaise).toHaveLength(1);
    expect(plan.net).toBe(1015000); // ₹10,150 — a quarter of ₹40,600
  });

  it("skips a student already invoiced for this term rather than billing twice", () => {
    const plan = planTermBilling({
      candidates: [one(), one({ studentId: "s2", alreadyRaised: true })],
      share: 0.25,
    });
    expect(plan.toRaise.map((t) => t.studentId)).toEqual(["s1"]);
    expect(plan.alreadyRaised).toBe(1);
  });

  it("is a no-op when the whole term has already been raised", () => {
    const plan = planTermBilling({ candidates: [one({ alreadyRaised: true })], share: 0.25 });
    expect(plan.toRaise).toEqual([]);
    expect(plan.net).toBe(0);
  });

  it("never sends a family a demand for nothing", () => {
    const plan = planTermBilling({ candidates: [one({ lines: [] })], share: 0.25 });
    expect(plan.toRaise).toEqual([]);
    expect(plan.notEligible).toBe(1);
  });

  it("counts a student whose class has no fees priced as not eligible, not as billed", () => {
    const plan = planTermBilling({ candidates: [one({ eligible: false })], share: 0.25 });
    expect(plan.notEligible).toBe(1);
    expect(plan.toRaise).toEqual([]);
  });

  it("applies a concession to the term, not to the year", () => {
    const plan = planTermBilling({
      candidates: [one({ concessions: [{ percentage: 25, heads: ["Tuition Fee"] }] })],
      share: 0.25,
    });
    expect(plan.gross).toBe(1015000);
    expect(plan.concession).toBe(250000);  // 25% of the term's ₹10,000 tuition
    expect(plan.net).toBe(765000);
  });

  it("totals across a whole school, gross less concession", () => {
    const plan = planTermBilling({
      candidates: [one(), one({ studentId: "s2" }), one({ studentId: "s3" })],
      share: 0.25,
    });
    expect(plan.toRaise).toHaveLength(3);
    expect(plan.net).toBe(plan.gross - plan.concession);
    expect(plan.net).toBe(3045000);
  });
});
