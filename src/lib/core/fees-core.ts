/**
 * Fee arithmetic. Pure. Every rupee a parent is asked for is computed here, so
 * the invoice, the receipt, the dues report and the parent's screen can never
 * disagree with each other.
 *
 * Design stance (from the market research): the invoice is ITEMISED head-wise,
 * concessions are shown as their own line, and nothing is ever added silently.
 */

export type FeeLine = {
  head: string;
  amount: number; // paise, gross for this head
  concession?: number; // paise deducted from this head
  optional?: boolean;
  note?: string;
};

export type InvoiceTotals = {
  gross: number;
  concession: number;
  lateFee: number;
  net: number;
  lines: FeeLine[];
};

export type ConcessionRule = {
  /** applies to all heads unless `heads` is given */
  heads?: string[];
  percentage?: number; // 0–100
  fixedAmount?: number; // paise, applied after percentages
  label?: string;
};

export type LateFineRule = {
  graceDays: number;
  perDayAmount: number;
  flatAmount: number;
  maxAmount?: number | null;
};

/**
 * Build the itemised invoice for one installment.
 *
 * `share` splits an annual structure across installments (e.g. 0.25 for a
 * quarterly term). Rounding is per-head so the four terms always re-add to the
 * annual total — a school that finds ₹1 missing loses trust in the whole system.
 */
export function buildInvoice(params: {
  lines: FeeLine[];
  concessions?: ConcessionRule[];
  share?: number;
  lateFee?: number;
}): InvoiceTotals {
  const share = params.share ?? 1;
  const concessions = params.concessions ?? [];

  // Schools bill in whole rupees. A parent handed an invoice for ₹10,500.38 stops
  // trusting the system, so every scaled amount is rounded to the rupee.
  const scaled: FeeLine[] = params.lines.map((l) => ({
    ...l,
    amount: toRupee(l.amount * share),
    concession: 0,
  }));

  for (const rule of concessions) {
    const targets = rule.heads?.length
      ? scaled.filter((l) => rule.heads!.includes(l.head))
      : scaled;

    if (rule.percentage) {
      for (const line of targets) {
        line.concession = (line.concession ?? 0) + toRupee((line.amount * rule.percentage) / 100);
      }
    }

    if (rule.fixedAmount) {
      // A fixed concession is spread across the targeted heads, largest first,
      // and never exceeds what is actually owed on them.
      let remaining = toRupee(rule.fixedAmount * share);
      const order = [...targets].sort((a, b) => b.amount - a.amount);
      for (const line of order) {
        if (remaining <= 0) break;
        const room = line.amount - (line.concession ?? 0);
        const take = Math.min(room, remaining);
        line.concession = (line.concession ?? 0) + take;
        remaining -= take;
      }
    }
  }

  const gross = sum(scaled.map((l) => l.amount));
  const concession = sum(scaled.map((l) => l.concession ?? 0));
  const lateFee = params.lateFee ?? 0;

  return {
    gross,
    concession,
    lateFee,
    net: gross - concession + lateFee,
    lines: scaled,
  };
}

/** Late fine for an unpaid invoice as of `asOf`. Never exceeds maxAmount. */
export function lateFineFor(params: {
  dueDate: Date;
  asOf: Date;
  outstanding: number;
  rule: LateFineRule | null;
}): number {
  const { rule, dueDate, asOf, outstanding } = params;
  if (!rule || outstanding <= 0) return 0;

  const days = daysBetween(dueDate, asOf) - rule.graceDays;
  if (days <= 0) return 0;

  const fine = rule.flatAmount + rule.perDayAmount * days;
  const capped = rule.maxAmount != null ? Math.min(fine, rule.maxAmount) : fine;
  // A fine larger than the fee itself is indefensible; cap it there too.
  return Math.max(0, Math.min(capped, outstanding));
}

export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((b - a) / 86_400_000);
}

export type InvoiceLike = {
  amount: number;
  paidAmount: number;
  status: string;
  dueDate: Date;
};

export function outstandingOf(inv: InvoiceLike): number {
  if (inv.status === "CANCELLED") return 0;
  return Math.max(0, inv.amount - inv.paidAmount);
}

export function statusAfterPayment(amount: number, paid: number): "UNPAID" | "PARTIAL" | "PAID" {
  if (paid <= 0) return "UNPAID";
  if (paid >= amount) return "PAID";
  return "PARTIAL";
}

/** Aging buckets for the defaulter report the principal actually asks for. */
export function ageBucket(daysOverdue: number): "CURRENT" | "1-30" | "31-60" | "61-90" | "90+" {
  if (daysOverdue <= 0) return "CURRENT";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

export function summariseDues(
  invoices: InvoiceLike[],
  asOf: Date,
): { total: number; overdue: number; buckets: Record<string, number> } {
  const buckets: Record<string, number> = { CURRENT: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  let total = 0;
  let overdue = 0;

  for (const inv of invoices) {
    const out = outstandingOf(inv);
    if (out === 0) continue;
    total += out;
    const days = daysBetween(inv.dueDate, asOf);
    if (days > 0) overdue += out;
    buckets[ageBucket(days)] += out;
  }

  return { total, overdue, buckets };
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/** Round a paise amount to a whole rupee. */
export function toRupee(p: number): number {
  return Math.round(p / 100) * 100;
}

/** Split an annual amount into n installments with no rounding loss. */
export function splitEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * One student's candidacy for a term's invoice, as gathered from the database.
 *
 * `eligible` and `alreadyRaised` are the caller's findings, not judgements made
 * here — the core's job is to say what the school is about to bill, in total,
 * before anybody writes 800 rows.
 */
export type BillingCandidate = {
  studentId: string;
  name: string;
  className: string;
  lines: FeeLine[];
  concessions?: ConcessionRule[];
  alreadyRaised: boolean;
  /** false when the student's class has no fees priced, or the student has left */
  eligible: boolean;
};

export type TermBillingPlan = {
  toRaise: { studentId: string; totals: InvoiceTotals }[];
  alreadyRaised: number;
  notEligible: number;
  gross: number;
  concession: number;
  net: number;
};

/**
 * What raising this term would actually bill.
 *
 * The same function answers "show me what will happen" and "do it", so the number
 * a school is shown before it commits is arithmetically the same number it commits
 * to — not a second estimate written separately and free to drift.
 *
 * A student already invoiced for this term is skipped, not re-billed: raising a
 * term twice must be a no-op rather than a doubled demand on a family.
 */
export function planTermBilling(params: { candidates: BillingCandidate[]; share: number }): TermBillingPlan {
  const plan: TermBillingPlan = {
    toRaise: [], alreadyRaised: 0, notEligible: 0, gross: 0, concession: 0, net: 0,
  };

  for (const c of params.candidates) {
    if (!c.eligible) {
      plan.notEligible += 1;
      continue;
    }
    if (c.alreadyRaised) {
      plan.alreadyRaised += 1;
      continue;
    }
    const totals = buildInvoice({ lines: c.lines, concessions: c.concessions, share: params.share });
    // A term that comes to nothing is not an invoice. A family should not receive a
    // demand for ₹0, and a ₹0 row would show up as an unpaid invoice for ever.
    if (totals.net <= 0) {
      plan.notEligible += 1;
      continue;
    }
    plan.toRaise.push({ studentId: c.studentId, totals });
    plan.gross += totals.gross;
    plan.concession += totals.concession;
    plan.net += totals.net;
  }

  return plan;
}
