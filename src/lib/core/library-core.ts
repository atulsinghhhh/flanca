/**
 * Library rules. Pure.
 *
 * A school library's whole job is knowing who has what and what is overdue.
 * The fine maths lives here so the counter, the student page and the report can
 * never disagree about what a child owes.
 */

export const LOAN_DAYS = 14;
export const FINE_PER_DAY = 200; // paise
export const MAX_FINE = 10000; // paise — never more than the price of a paperback
export const MAX_BOOKS_PER_STUDENT = 3;

export function dueDateFor(issuedOn: Date, loanDays = LOAN_DAYS): Date {
  return new Date(issuedOn.getTime() + loanDays * 86_400_000);
}

export function daysOverdue(dueOn: Date, asOf: Date): number {
  const a = Date.UTC(dueOn.getUTCFullYear(), dueOn.getUTCMonth(), dueOn.getUTCDate());
  const b = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

/** Capped, and never charged for a book returned on time. */
export function fineFor(dueOn: Date, returnedOn: Date | null, asOf: Date): number {
  const reference = returnedOn ?? asOf;
  const late = daysOverdue(dueOn, reference);
  if (late <= 0) return 0;
  return Math.min(MAX_FINE, late * FINE_PER_DAY);
}

export type IssueCheck = { allowed: boolean; reason: string | null };

/**
 * Whether a student may take another book. A librarian needs the reason, not a
 * silent refusal — "she already has three" is what gets said across the desk.
 */
export function canIssue(params: {
  availableCopies: number;
  openLoans: number;
  unpaidFines: number;
  maxBooks?: number;
}): IssueCheck {
  if (params.availableCopies <= 0) {
    return { allowed: false, reason: "No copy of this book is on the shelf" };
  }
  const max = params.maxBooks ?? MAX_BOOKS_PER_STUDENT;
  if (params.openLoans >= max) {
    return { allowed: false, reason: `Already has ${params.openLoans} books out (limit ${max})` };
  }
  if (params.unpaidFines > 0) {
    return { allowed: false, reason: "Has an unpaid fine to clear first" };
  }
  return { allowed: true, reason: null };
}

/** ISBN-13 / ISBN-10 checksum, so a mistyped number is caught at the desk. */
export function isValidIsbn(raw: string): boolean {
  const isbn = raw.replace(/[\s-]/g, "").toUpperCase();

  if (/^\d{13}$/.test(isbn)) {
    const sum = [...isbn].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0;
  }

  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((acc, ch, i) => {
      const value = ch === "X" ? 10 : Number(ch);
      return acc + value * (10 - i);
    }, 0);
    return sum % 11 === 0;
  }

  return false;
}
