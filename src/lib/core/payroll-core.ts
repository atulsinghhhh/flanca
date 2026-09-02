/**
 * Salary arithmetic. Pure.
 *
 * Deliberately a SALARY REGISTER, not statutory payroll: a 500-student school
 * needs a monthly sheet it can pay from and hand to its accountant, not TDS
 * filing. Every amount is integer paise.
 */

export type PayComponent = { label: string; amount: number };

export type SalaryInput = {
  basic: number;
  allowances?: PayComponent[];
  deductions?: PayComponent[];
  daysPayable?: number;
  daysPresent?: number;
  /** unrecovered advance carried from earlier months */
  advanceOutstanding?: number;
  advanceRecovery?: number;
};

export type SalaryBreakdown = {
  basic: number;
  proratedBasic: number;
  allowanceTotal: number;
  deductionTotal: number;
  advanceRecovery: number;
  gross: number;
  netPay: number;
  lopDays: number;
  allowances: PayComponent[];
  deductions: PayComponent[];
};

/**
 * Loss of pay is prorated on the basic only — allowances in a small school are
 * typically fixed monthly amounts, and inventing a different rule would produce
 * a number the accountant cannot reproduce by hand.
 */
export function computeSalary(input: SalaryInput): SalaryBreakdown {
  const allowances = input.allowances ?? [];
  const deductions = input.deductions ?? [];

  const daysPayable = input.daysPayable ?? 0;
  const daysPresent = input.daysPresent ?? daysPayable;
  const lopDays = daysPayable > 0 ? Math.max(0, daysPayable - daysPresent) : 0;

  const proratedBasic =
    daysPayable > 0 && lopDays > 0
      ? toRupee((input.basic * (daysPayable - lopDays)) / daysPayable)
      : input.basic;

  const allowanceTotal = allowances.reduce((a, c) => a + c.amount, 0);
  const deductionTotal = deductions.reduce((a, c) => a + c.amount, 0);

  // Never recover more advance than is actually outstanding, and never push the
  // net below zero — a payslip showing negative pay is a support call.
  const wantedRecovery = input.advanceRecovery ?? 0;
  const gross = proratedBasic + allowanceTotal;
  const afterDeductions = Math.max(0, gross - deductionTotal);
  const advanceRecovery = Math.min(
    wantedRecovery,
    input.advanceOutstanding ?? wantedRecovery,
    afterDeductions,
  );

  return {
    basic: input.basic,
    proratedBasic,
    allowanceTotal,
    deductionTotal,
    advanceRecovery,
    gross,
    netPay: afterDeductions - advanceRecovery,
    lopDays,
    allowances,
    deductions,
  };
}

/** Standard components a small Indian school actually uses. */
export function defaultAllowances(basic: number): PayComponent[] {
  return [
    { label: "HRA", amount: toRupee(basic * 0.2) },
    { label: "Conveyance", amount: 120000 },
  ];
}

export function defaultDeductions(basic: number): PayComponent[] {
  return [
    { label: "PF", amount: toRupee(basic * 0.12) },
    { label: "Professional Tax", amount: 20000 },
  ];
}

export function toRupee(paise: number): number {
  return Math.round(paise / 100) * 100;
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(month: number, year: number): string {
  return `${MONTHS[month - 1] ?? "—"} ${year}`;
}
