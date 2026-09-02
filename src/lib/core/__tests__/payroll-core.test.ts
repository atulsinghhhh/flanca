import { describe, expect, it } from "vitest";
import { computeSalary, defaultAllowances, defaultDeductions, monthLabel } from "../payroll-core";

const paise = (r: number) => r * 100;

describe("computeSalary", () => {
  const basic = paise(30000);

  it("pays the full basic when nobody missed a day", () => {
    const s = computeSalary({
      basic,
      allowances: [{ label: "HRA", amount: paise(6000) }],
      deductions: [{ label: "PF", amount: paise(3600) }],
      daysPayable: 26,
      daysPresent: 26,
    });
    expect(s.proratedBasic).toBe(basic);
    expect(s.gross).toBe(paise(36000));
    expect(s.netPay).toBe(paise(32400));
    expect(s.lopDays).toBe(0);
  });

  it("prorates the basic on loss of pay, but not the allowances", () => {
    const s = computeSalary({
      basic,
      allowances: [{ label: "HRA", amount: paise(6000) }],
      daysPayable: 26,
      daysPresent: 24,
    });
    expect(s.lopDays).toBe(2);
    // 30000 * 24/26 = 27692.3 -> rounded to the rupee
    expect(s.proratedBasic).toBe(paise(27692));
    expect(s.allowanceTotal).toBe(paise(6000));
  });

  it("never recovers more advance than is outstanding", () => {
    const s = computeSalary({
      basic,
      advanceOutstanding: paise(2000),
      advanceRecovery: paise(5000),
    });
    expect(s.advanceRecovery).toBe(paise(2000));
    expect(s.netPay).toBe(paise(28000));
  });

  it("never produces a negative payslip", () => {
    const s = computeSalary({
      basic: paise(1000),
      deductions: [{ label: "Something huge", amount: paise(5000) }],
      advanceRecovery: paise(5000),
      advanceOutstanding: paise(5000),
    });
    expect(s.netPay).toBe(0);
    expect(s.advanceRecovery).toBe(0);
  });

  it("treats a missing attendance record as full attendance rather than zero pay", () => {
    const s = computeSalary({ basic });
    expect(s.proratedBasic).toBe(basic);
    expect(s.netPay).toBe(basic);
  });
});

describe("standard components", () => {
  it("computes HRA and PF off the basic", () => {
    expect(defaultAllowances(paise(30000))[0]).toEqual({ label: "HRA", amount: paise(6000) });
    expect(defaultDeductions(paise(30000))[0]).toEqual({ label: "PF", amount: paise(3600) });
  });
});

describe("monthLabel", () => {
  it("names the month", () => {
    expect(monthLabel(7, 2026)).toBe("July 2026");
    expect(monthLabel(13, 2026)).toBe("— 2026");
  });
});
