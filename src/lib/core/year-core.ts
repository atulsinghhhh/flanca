/**
 * The academic year and the terms inside it. Pure.
 *
 * Nothing in this product worked without a year: fee structures, invoices, exam
 * terms and report cards all hang off `AcademicYear`, and until now the only way to
 * get one was the seed. A school signing up on Monday had a school, a login, and no
 * year — so no fees, no marks, no report cards, and no screen that would say why.
 *
 * Terms are the same story from the other end. A term due date could be edited but
 * a term could not be created, so a new school's fee structure had nothing to
 * divide into and the invoices screen had nothing to raise.
 */

export type YearCheck = { allowed: boolean; reason: string | null };

const ALLOWED: YearCheck = { allowed: true, reason: null };
const refuse = (reason: string): YearCheck => ({ allowed: false, reason });

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * What a school means when it types a year.
 * "2026-2027" → "2026-27" · "26-27" → "2026-27" · "2026" → "2026-27"
 *
 * An Indian school year runs April to March and is always written across two
 * calendar years, so a single year typed on its own means the one that starts then.
 */
export function tidyYearName(raw: string): string {
  const t = raw.trim().replace(/\s+/g, "");
  let m = /^(\d{4})[-/](\d{4})$/.exec(t);
  if (m) return `${m[1]}-${m[2].slice(2)}`;
  m = /^(\d{4})[-/](\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}`;
  m = /^(\d{2})[-/](\d{2})$/.exec(t);
  if (m) return `20${m[1]}-${m[2]}`;
  m = /^(\d{4})$/.exec(t);
  if (m) return `${m[1]}-${String((Number(m[1]) + 1) % 100).padStart(2, "0")}`;
  return raw.trim();
}

export function validateYearName(raw: string, existing: string[] = []): YearCheck {
  const name = tidyYearName(raw);
  if (name === "") return refuse("Give the year a name, like 2026-27.");
  if (name.length > 20) return refuse("That year name is too long.");
  if (existing.some((e) => e.trim().toLowerCase() === name.toLowerCase())) {
    return refuse(`${name} already exists.`);
  }
  return ALLOWED;
}

/**
 * A year has to be a year. The bounds are deliberately loose — some schools run
 * June to April, some January to December — but a year that ends before it starts,
 * or runs for three months, or for three years, is a typo.
 */
export function validateYearDates(startIso: string, endIso: string): YearCheck {
  const start = new Date(`${startIso}T00:00:00.000Z`).getTime();
  const end = new Date(`${endIso}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(start)) return refuse("That start date is not a date.");
  if (!Number.isFinite(end)) return refuse("That end date is not a date.");
  if (end <= start) return refuse("The year ends before it starts.");
  const days = (end - start) / DAY;
  if (days < 150) return refuse("That is less than five months — check the dates.");
  if (days > 550) return refuse("That is more than eighteen months — check the dates.");
  return ALLOWED;
}

/**
 * A year can go only while nothing has *happened* in it.
 *
 * The line is between history and configuration. An invoice is history: a parent
 * was handed it, and it must not vanish because somebody tidied up a year. An
 * enrolment is history too. A fee structure and an exam term are configuration —
 * they were typed in, nothing was billed from them, and they belong to the year
 * rather than outliving it. Refusing on those made a year created by mistake
 * permanently undeletable, because nothing in the product removes a fee structure.
 *
 * `alsoGoes` is what the caller must say out loud before doing it.
 */
export function canDeleteYear(counts: {
  invoices: number;
  structures: number;
  examTerms: number;
  enrollments: number;
  isCurrent: boolean;
}): YearCheck & { alsoGoes: string | null } {
  const no = (reason: string) => ({ allowed: false, reason, alsoGoes: null });

  if (counts.isCurrent) return no("This is the current year. Make another year current first.");
  if (counts.invoices > 0) {
    return no(
      `${counts.invoices} ${counts.invoices === 1 ? "invoice was" : "invoices were"} raised in this year. It stays, so the school's billing history stays.`,
    );
  }
  if (counts.enrollments > 0) {
    return no(
      `${counts.enrollments} ${counts.enrollments === 1 ? "child was" : "children were"} enrolled in this year. It stays.`,
    );
  }

  const goes: string[] = [];
  if (counts.structures > 0) {
    goes.push(`the fee structure for ${counts.structures} ${counts.structures === 1 ? "class" : "classes"}`);
  }
  if (counts.examTerms > 0) {
    goes.push(`${counts.examTerms} exam ${counts.examTerms === 1 ? "term" : "terms"}`);
  }
  return {
    allowed: true,
    reason: null,
    alsoGoes: goes.length === 0 ? null : `This also removes ${goes.join(" and ")}. Nothing was billed from any of it.`,
  };
}

export function validateTermLabel(raw: string, existing: string[] = []): YearCheck {
  const label = raw.trim().replace(/\s+/g, " ");
  if (label === "") return refuse("Give the term a name, like Term 1 (Apr–Jun).");
  if (label.length > 40) return refuse("That term name will not fit on an invoice.");
  if (existing.some((e) => e.trim().toLowerCase() === label.toLowerCase())) {
    return refuse(`${label} already exists in this year.`);
  }
  return ALLOWED;
}

/**
 * A term can go only while nothing has been billed for it. An invoice names its
 * term on the parent's copy.
 */
export function canDeleteTerm(counts: { invoices: number }): YearCheck {
  if (counts.invoices > 0) {
    return refuse(
      `${counts.invoices} ${counts.invoices === 1 ? "invoice has" : "invoices have"} been raised for this term. It stays.`,
    );
  }
  return ALLOWED;
}

/**
 * Sensible terms for a year, so a school picks "four terms" instead of typing
 * twelve fields.
 *
 * The label carries the months it covers — "Term 1 (Apr–Jun)" — because that is
 * what a parent reads on the invoice, and "Term 1" alone tells them nothing about
 * what they are paying for. Each falls due on the 15th of its first month, which is
 * the convention every school we looked at uses: fees for a term are collected at
 * its start, not at its end.
 */
export function suggestTerms(
  startIso: string,
  endIso: string,
  count: number,
): { label: string; dueDate: string }[] {
  const start = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  if (count < 1 || count > 12) return [];

  const totalMonths = Math.max(
    count,
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1,
  );
  const per = Math.floor(totalMonths / count);
  const extra = totalMonths % count;

  const out: { label: string; dueDate: string }[] = [];
  let month = start.getUTCMonth();
  let year = start.getUTCFullYear();

  for (let i = 0; i < count; i++) {
    const span = per + (i < extra ? 1 : 0);
    const firstMonth = MONTHS[month % 12];
    const lastIndex = (month + span - 1) % 12;
    const lastMonth = MONTHS[lastIndex];
    const label =
      span === 1
        ? `${ordinalTerm(i, count)} (${firstMonth})`
        : `${ordinalTerm(i, count)} (${firstMonth}–${lastMonth})`;
    const due = new Date(Date.UTC(year, month, 15));
    out.push({ label, dueDate: due.toISOString().slice(0, 10) });

    month += span;
    while (month >= 12) {
      month -= 12;
      year += 1;
    }
  }
  return out;
}

/** Two terms are halves, four are terms, twelve are months — schools name them so. */
function ordinalTerm(index: number, count: number): string {
  if (count === 2) return index === 0 ? "First Half" : "Second Half";
  if (count === 12) return "Month";
  return `Term ${index + 1}`;
}
