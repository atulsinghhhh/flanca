import { describe, expect, it } from "vitest";
import {
  canDeleteConcessionType,
  canGrantConcession,
  fineAfterDays,
  validateConcessionType,
  validateFinePolicy,
} from "../concession-core";
import { lateFineFor } from "../fees-core";

describe("validateConcessionType", () => {
  it("accepts a percentage concession", () => {
    expect(validateConcessionType({ name: "Sibling", percentage: 10 }).ok).toBe(true);
  });

  it("accepts a fixed-amount concession", () => {
    expect(validateConcessionType({ name: "EWS Support", fixedAmountPaise: 600000 }).ok).toBe(true);
  });

  it("insists on knowing how much comes off", () => {
    const check = validateConcessionType({ name: "Merit" });
    expect(check.ok).toBe(false);
    expect(check.messages[0].message).toMatch(/a percentage or an amount/);
  });

  it("refuses both at once, because buildInvoice would apply them one after the other", () => {
    const check = validateConcessionType({ name: "Merit", percentage: 25, fixedAmountPaise: 100000 });
    expect(check.ok).toBe(false);
    expect(check.messages[0].message).toMatch(/two concessions with one name/);
  });

  it("refuses a percentage that is not one", () => {
    expect(validateConcessionType({ name: "X", percentage: 0 }).ok).toBe(false);
    expect(validateConcessionType({ name: "X", percentage: 101 }).ok).toBe(false);
    expect(validateConcessionType({ name: "X", percentage: 12.5 }).ok).toBe(false);
  });

  it("allows a full waiver but says what it means", () => {
    const check = validateConcessionType({ name: "RTE", percentage: 100 });
    expect(check.ok).toBe(true);
    expect(check.messages[0].message).toMatch(/charged nothing/);
  });

  it("refuses a duplicate name however typed", () => {
    expect(validateConcessionType({ name: "sibling", percentage: 5, existingNames: ["Sibling"] }).ok).toBe(false);
  });

  it("catches a misplaced zero on a fixed amount", () => {
    expect(validateConcessionType({ name: "X", fixedAmountPaise: 5_000_001_00 }).ok).toBe(false);
  });
});

describe("canDeleteConcessionType", () => {
  it("allows removing one nobody is on", () => {
    expect(canDeleteConcessionType({ students: 0 }).allowed).toBe(true);
  });

  it("refuses while children are on it, in numbers", () => {
    expect(canDeleteConcessionType({ students: 1 }).reason).toMatch(/1 child is/);
    expect(canDeleteConcessionType({ students: 70 }).reason).toMatch(/70 children are/);
  });
});

describe("canGrantConcession", () => {
  const base = { studentStatus: "ACTIVE", alreadyHasThisType: false, otherConcessions: 0 };

  it("allows an ordinary grant", () => {
    expect(canGrantConcession(base).allowed).toBe(true);
  });

  it("refuses the same concession twice, which is what halves a fee twice", () => {
    expect(canGrantConcession({ ...base, alreadyHasThisType: true }).reason).toMatch(/already has that concession/);
  });

  it("refuses a child who has left", () => {
    expect(canGrantConcession({ ...base, studentStatus: "TRANSFERRED" }).allowed).toBe(false);
  });

  it("stops at a fourth and says to check what the child is actually charged", () => {
    expect(canGrantConcession({ ...base, otherConcessions: 3 }).reason).toMatch(/before adding a fourth/);
  });
});

describe("validateFinePolicy", () => {
  it("accepts an ordinary policy", () => {
    const check = validateFinePolicy({ graceDays: 7, flatAmountPaise: 10000, perDayAmountPaise: 500, maxAmountPaise: 100000 });
    expect(check.ok).toBe(true);
    expect(check.messages).toEqual([]);
  });

  it("refuses negative charges", () => {
    expect(validateFinePolicy({ flatAmountPaise: -1 }).ok).toBe(false);
    expect(validateFinePolicy({ perDayAmountPaise: -1 }).ok).toBe(false);
    expect(validateFinePolicy({ graceDays: -1 }).ok).toBe(false);
  });

  it("refuses a cap below the flat charge, which could never then be applied", () => {
    const check = validateFinePolicy({ flatAmountPaise: 50000, maxAmountPaise: 10000 });
    expect(check.ok).toBe(false);
    expect(check.messages[0].message).toMatch(/below the flat charge/);
  });

  it("warns about an uncapped daily charge", () => {
    const check = validateFinePolicy({ perDayAmountPaise: 500, maxAmountPaise: null });
    expect(check.ok).toBe(true);
    expect(check.messages[0].message).toMatch(/grows for as long as an invoice is forgotten/);
  });

  it("says plainly when a policy does nothing at all", () => {
    expect(validateFinePolicy({ flatAmountPaise: 0, perDayAmountPaise: 0 }).messages[0].message).toMatch(/does nothing/);
  });

  it("questions three months of grace", () => {
    expect(validateFinePolicy({ graceDays: 120, flatAmountPaise: 100 }).messages[0].level).toBe("WARNING");
  });
});

describe("fineAfterDays — the preview cannot disagree with what is charged", () => {
  it("charges nothing inside the grace period", () => {
    expect(fineAfterDays({ daysLate: 5, graceDays: 7, flatAmountPaise: 10000, perDayAmountPaise: 500, maxAmountPaise: null, outstandingPaise: 1000000 })).toBe(0);
  });

  it("adds the flat charge plus the daily one after grace", () => {
    // 10 days late, 7 grace → 3 chargeable days: ₹100 + 3 × ₹5 = ₹115
    expect(fineAfterDays({ daysLate: 10, graceDays: 7, flatAmountPaise: 10000, perDayAmountPaise: 500, maxAmountPaise: null, outstandingPaise: 1000000 })).toBe(11500);
  });

  it("respects the cap", () => {
    expect(fineAfterDays({ daysLate: 400, graceDays: 0, flatAmountPaise: 0, perDayAmountPaise: 500, maxAmountPaise: 50000, outstandingPaise: 1000000 })).toBe(50000);
  });

  it("never exceeds what is owed", () => {
    expect(fineAfterDays({ daysLate: 400, graceDays: 0, flatAmountPaise: 0, perDayAmountPaise: 500, maxAmountPaise: null, outstandingPaise: 20000 })).toBe(20000);
  });

  it("agrees with lateFineFor, which is the whole point of it existing", () => {
    const rule = { graceDays: 7, perDayAmount: 500, flatAmount: 10000, maxAmount: 100000 };
    const dueDate = new Date("2026-07-15T00:00:00Z");
    const asOf = new Date("2026-08-20T00:00:00Z"); // 36 days later
    const outstanding = 1370000;
    expect(
      fineAfterDays({
        daysLate: 36,
        graceDays: rule.graceDays,
        flatAmountPaise: rule.flatAmount,
        perDayAmountPaise: rule.perDayAmount,
        maxAmountPaise: rule.maxAmount,
        outstandingPaise: outstanding,
      }),
    ).toBe(lateFineFor({ dueDate, asOf, outstanding, rule }));
  });
});
