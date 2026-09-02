/**
 * Concessions and the late fee. Pure.
 *
 * Both decide real money and both were seed-only. A school could not create the
 * concession its RTE children are entitled to, could not grant one, could not
 * approve one, and could not say what it charges for paying late — while
 * `lateFineFor` and `buildInvoice` sat there ready to apply whatever it was told.
 *
 * The reason to be careful here is asymmetry: a concession that is too small and a
 * fine that is too large both take money from a family, and neither shows up as an
 * error anywhere. So the rules below refuse the shapes that are indefensible rather
 * than merely unusual.
 */

export type ConcessionField = "name" | "amount" | "heads" | "reason";
export type FineField = "graceDays" | "flatAmount" | "perDayAmount" | "maxAmount";

export type MoneyRuleMessage<F extends string> = { field: F; level: "ERROR" | "WARNING"; message: string };
export type MoneyRuleCheck<F extends string> = { ok: boolean; messages: MoneyRuleMessage<F>[] };
export type MoneyGuard = { allowed: boolean; reason: string | null };

const MAX_FIXED_CONCESSION_PAISE = 5_000_000_00; // ₹50 lakh, the same absurdity guard fees use

export function validateConcessionType(params: {
  name?: string | null;
  percentage?: number | null;
  fixedAmountPaise?: number | null;
  existingNames?: string[];
}): MoneyRuleCheck<ConcessionField> {
  const messages: MoneyRuleMessage<ConcessionField>[] = [];
  const name = (params.name ?? "").trim().replace(/\s+/g, " ");

  if (name === "") messages.push({ field: "name", level: "ERROR", message: "Give the concession a name, like Sibling or RTE." });
  else if (name.length > 40) messages.push({ field: "name", level: "ERROR", message: "That name will not fit on an invoice." });
  else if ((params.existingNames ?? []).some((e) => e.trim().toLowerCase() === name.toLowerCase())) {
    messages.push({ field: "name", level: "ERROR", message: `${name} already exists.` });
  }

  const pct = params.percentage ?? null;
  const fixed = params.fixedAmountPaise ?? null;

  if (pct == null && fixed == null) {
    messages.push({ field: "amount", level: "ERROR", message: "Say how much it takes off: a percentage or an amount." });
  } else if (pct != null && fixed != null) {
    // buildInvoice applies percentages first and then spends fixed amounts against
    // what is left, so a type carrying both is two concessions wearing one name.
    messages.push({
      field: "amount",
      level: "ERROR",
      message: "One or the other, not both. A percentage and an amount together is two concessions with one name.",
    });
  } else if (pct != null) {
    if (!Number.isInteger(pct) || pct <= 0 || pct > 100) {
      messages.push({ field: "amount", level: "ERROR", message: "A percentage is a whole number between 1 and 100." });
    } else if (pct === 100) {
      messages.push({ field: "amount", level: "WARNING", message: "100% — this family will be charged nothing for the heads it covers." });
    }
  } else if (fixed != null) {
    if (!Number.isInteger(fixed) || fixed <= 0) {
      messages.push({ field: "amount", level: "ERROR", message: "An amount has to be more than nothing." });
    } else if (fixed > MAX_FIXED_CONCESSION_PAISE) {
      messages.push({ field: "amount", level: "ERROR", message: "That is over ₹50 lakh — check the zeroes." });
    }
  }

  return { ok: messages.every((m) => m.level !== "ERROR"), messages };
}

/** A concession type in use stays: invoices already raised show it by name. */
export function canDeleteConcessionType(counts: { students: number }): MoneyGuard {
  if (counts.students > 0) {
    return {
      allowed: false,
      reason: `${counts.students} ${counts.students === 1 ? "child is" : "children are"} on this concession. Move them off it first.`,
    };
  }
  return { allowed: true, reason: null };
}

/**
 * Granting one to a child.
 *
 * Two of the same type is the mistake that halves a fee twice. A concession on a
 * child who has left is not wrong so much as pointless, and worth saying.
 */
export function canGrantConcession(params: {
  studentStatus: string;
  alreadyHasThisType: boolean;
  otherConcessions: number;
}): MoneyGuard {
  if (params.alreadyHasThisType) {
    return { allowed: false, reason: "This child already has that concession." };
  }
  if (params.studentStatus !== "ACTIVE") {
    return { allowed: false, reason: "That child is not on the roll any more." };
  }
  if (params.otherConcessions >= 3) {
    return {
      allowed: false,
      reason: "Three concessions is already unusual. Check the fee this child is actually being charged before adding a fourth.",
    };
  }
  return { allowed: true, reason: null };
}

/**
 * What the school charges for paying late.
 *
 * `lateFineFor` already caps a fine at the amount owed, so nothing here can produce
 * a fine larger than the fee. What it cannot protect against is a per-day charge
 * with no ceiling, which on a forgotten invoice grows quietly for months — so that
 * gets said out loud.
 */
export function validateFinePolicy(params: {
  graceDays?: number | null;
  flatAmountPaise?: number | null;
  perDayAmountPaise?: number | null;
  maxAmountPaise?: number | null;
}): MoneyRuleCheck<FineField> {
  const messages: MoneyRuleMessage<FineField>[] = [];
  const grace = params.graceDays ?? 0;
  const flat = params.flatAmountPaise ?? 0;
  const perDay = params.perDayAmountPaise ?? 0;
  const max = params.maxAmountPaise ?? null;

  if (!Number.isInteger(grace) || grace < 0) {
    messages.push({ field: "graceDays", level: "ERROR", message: "A grace period is a whole number of days, or none." });
  } else if (grace > 90) {
    messages.push({ field: "graceDays", level: "WARNING", message: "Over three months of grace — a late fee this late is not really a late fee." });
  }

  for (const [field, value, label] of [
    ["flatAmount", flat, "flat charge"],
    ["perDayAmount", perDay, "daily charge"],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      messages.push({ field, level: "ERROR", message: `The ${label} cannot be negative.` });
    }
  }

  if (max != null) {
    if (!Number.isInteger(max) || max < 0) {
      messages.push({ field: "maxAmount", level: "ERROR", message: "A cap cannot be negative." });
    } else if (max > 0 && max < flat) {
      messages.push({
        field: "maxAmount",
        level: "ERROR",
        message: "The cap is below the flat charge, so the flat charge could never be applied in full.",
      });
    }
  }

  if (perDay > 0 && max == null) {
    messages.push({
      field: "maxAmount",
      level: "WARNING",
      message: "A daily charge with no cap grows for as long as an invoice is forgotten. It stops at the fee itself, but set a cap.",
    });
  }

  if (flat === 0 && perDay === 0) {
    messages.push({
      field: "flatAmount",
      level: "WARNING",
      message: "Nothing is charged for paying late. That is a fine choice — the policy just does nothing.",
    });
  }

  return { ok: messages.every((m) => m.level !== "ERROR"), messages };
}

/**
 * What a policy would charge on one overdue invoice, for showing before it is saved.
 * Deliberately the same arithmetic as lateFineFor, minus the dates.
 */
export function fineAfterDays(params: {
  daysLate: number;
  graceDays: number;
  flatAmountPaise: number;
  perDayAmountPaise: number;
  maxAmountPaise: number | null;
  outstandingPaise: number;
}): number {
  const days = params.daysLate - params.graceDays;
  if (days <= 0 || params.outstandingPaise <= 0) return 0;
  const fine = params.flatAmountPaise + params.perDayAmountPaise * days;
  const capped = params.maxAmountPaise != null ? Math.min(fine, params.maxAmountPaise) : fine;
  return Math.max(0, Math.min(capped, params.outstandingPaise));
}
