/**
 * Setting up an exam cycle and its papers. Pure.
 *
 * Marks could be entered and report cards generated, but nothing in the product
 * could create the exam they belong to — the seed made every paper. A school's first
 * unit test had nowhere to go.
 *
 * The shape to respect is the one already in the database: an "exam cycle" as a
 * school says it — Unit Test 1, Half Yearly — is one ExamTerm row *per class*, and
 * `getExamTerms` groups them back by name to show one row per cycle. So creating a
 * cycle creates a row for each class it covers, and the rules here are about the
 * cycle as a whole.
 */

export type ExamField = "name" | "dates" | "weightage" | "maxMarks" | "passMarks" | "split" | "examDate";
export type ExamMessage = { field: ExamField; level: "ERROR" | "WARNING"; message: string };
export type ExamCheck = { ok: boolean; messages: ExamMessage[] };
export type ExamGuard = { allowed: boolean; reason: string | null };

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const at = (s: string) => new Date(`${s}T00:00:00.000Z`).getTime();

export function tidyCycleName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function validateExamCycle(params: {
  name: string;
  startIso?: string | null;
  endIso?: string | null;
  weightage?: number | null;
  existingNames?: string[];
  /** the weightages of the year's other cycles, to check they still add up */
  otherWeightages?: number[];
}): ExamCheck {
  const messages: ExamMessage[] = [];
  const name = tidyCycleName(params.name);

  if (name === "") messages.push({ field: "name", level: "ERROR", message: "Give the exam cycle a name, like Unit Test 1." });
  else if (name.length > 40) messages.push({ field: "name", level: "ERROR", message: "That name will not fit on a report card." });
  else if ((params.existingNames ?? []).some((e) => e.trim().toLowerCase() === name.toLowerCase())) {
    messages.push({ field: "name", level: "ERROR", message: `${name} already exists this year.` });
  }

  if (params.startIso && params.endIso) {
    const s = at(params.startIso);
    const e = at(params.endIso);
    if (!Number.isFinite(s) || !Number.isFinite(e)) {
      messages.push({ field: "dates", level: "ERROR", message: "Those are not dates." });
    } else if (e < s) {
      messages.push({ field: "dates", level: "ERROR", message: "The cycle ends before it starts." });
    } else if (e - s > 60 * DAY) {
      messages.push({ field: "dates", level: "WARNING", message: "That cycle runs for over two months — check the dates." });
    }
  }

  if (params.weightage != null) {
    if (!Number.isInteger(params.weightage) || params.weightage < 0 || params.weightage > 100) {
      messages.push({ field: "weightage", level: "ERROR", message: "A weightage is a whole number between 0 and 100." });
    } else {
      // The final report card is a weighted average of the year's cycles
      // (weightedFinalBp), so weightages that do not add to 100 quietly change what
      // every child's year-end percentage means.
      const total = (params.otherWeightages ?? []).reduce((a, w) => a + w, 0) + params.weightage;
      if (total !== 100) {
        messages.push({
          field: "weightage",
          level: "WARNING",
          message:
            total > 100
              ? `The year's cycles would add up to ${total}%. The final report card is a weighted average, so anything but 100 changes what every percentage means.`
              : `The year's cycles would add up to only ${total}%. The remaining ${100 - total}% belongs to a cycle that does not exist yet.`,
        });
      }
    }
  }

  return { ok: messages.every((m) => m.level !== "ERROR"), messages };
}

/**
 * One paper.
 *
 * `theoryMax` and `internalMax` are how CBSE splits a paper — 80 written plus 20
 * internal. If a school gives both, they have to add up to the total, or a child
 * scoring full marks in each ends up over 100%.
 */
export function validateExamPaper(params: {
  maxMarks: number | null;
  passMarks?: number | null;
  theoryMax?: number | null;
  internalMax?: number | null;
  examDateIso?: string | null;
  cycleStartIso?: string | null;
  cycleEndIso?: string | null;
}): ExamCheck {
  const messages: ExamMessage[] = [];

  if (params.maxMarks == null || !Number.isInteger(params.maxMarks) || params.maxMarks <= 0) {
    messages.push({ field: "maxMarks", level: "ERROR", message: "A paper is out of some whole number of marks." });
  } else if (params.maxMarks > 500) {
    messages.push({ field: "maxMarks", level: "WARNING", message: "Out of more than 500 — check that is the paper and not the subject total." });
  }

  if (params.passMarks != null) {
    if (!Number.isInteger(params.passMarks) || params.passMarks < 0) {
      messages.push({ field: "passMarks", level: "ERROR", message: "Pass marks cannot be negative." });
    } else if (params.maxMarks != null && params.passMarks > params.maxMarks) {
      messages.push({ field: "passMarks", level: "ERROR", message: "Nobody could pass — the pass mark is above the total." });
    }
  }

  const theory = params.theoryMax ?? null;
  const internal = params.internalMax ?? null;
  if (theory != null && internal != null && params.maxMarks != null) {
    if (theory + internal !== params.maxMarks) {
      messages.push({
        field: "split",
        level: "ERROR",
        message: `${theory} written plus ${internal} internal is ${theory + internal}, not ${params.maxMarks}.`,
      });
    }
  }

  if (params.examDateIso && params.cycleStartIso && params.cycleEndIso) {
    const d = at(params.examDateIso);
    const s = at(params.cycleStartIso);
    const e = at(params.cycleEndIso);
    if (Number.isFinite(d) && Number.isFinite(s) && Number.isFinite(e) && (d < s || d > e)) {
      messages.push({
        field: "examDate",
        level: "WARNING",
        message: "That date is outside the exam cycle's own dates.",
      });
    }
  }

  return { ok: messages.every((m) => m.level !== "ERROR"), messages };
}

/**
 * An exam cycle can go only while no marks have been entered against it. Report
 * cards refer to a cycle by id, so a published one stays whatever else is true.
 */
export function canDeleteExamCycle(counts: { results: number; reportCards: number }): ExamGuard {
  if (counts.results > 0) {
    return {
      allowed: false,
      reason: `${counts.results.toLocaleString("en-IN")} ${counts.results === 1 ? "mark has" : "marks have"} been entered for this cycle. It stays.`,
    };
  }
  if (counts.reportCards > 0) {
    return {
      allowed: false,
      reason: `${counts.reportCards} report ${counts.reportCards === 1 ? "card refers" : "cards refer"} to this cycle. It stays.`,
    };
  }
  return { allowed: true, reason: null };
}

export function canDeleteExamPaper(counts: { results: number }): ExamGuard {
  if (counts.results > 0) {
    return {
      allowed: false,
      reason: `${counts.results} ${counts.results === 1 ? "mark has" : "marks have"} been entered for this paper. Clear those first.`,
    };
  }
  return { allowed: true, reason: null };
}

/**
 * A date for each paper: one a day from the start, and never on a Sunday.
 *
 * Schools do sit papers on Saturdays. Nobody sits one on a Sunday, and a datesheet
 * that says otherwise is the first thing a parent queries.
 */
export function suggestPaperDates(startIso: string, count: number, papersPerDay = 1): string[] {
  const start = at(startIso);
  if (!Number.isFinite(start) || count < 1 || count > 60) return [];

  const out: string[] = [];
  let cursor = start;
  let onThisDay = 0;

  while (out.length < count) {
    if (new Date(cursor).getUTCDay() === 0) {
      cursor += DAY;
      onThisDay = 0;
      continue;
    }
    out.push(iso(cursor));
    onThisDay += 1;
    if (onThisDay >= papersPerDay) {
      cursor += DAY;
      onThisDay = 0;
    }
  }
  return out;
}

/** Whether a cycle can be published: every paper has to have its marks in. */
export function canPublishCycle(counts: { expected: number; entered: number }): ExamGuard {
  if (counts.expected === 0) return { allowed: false, reason: "This cycle has no papers yet." };
  if (counts.entered < counts.expected) {
    const left = counts.expected - counts.entered;
    return {
      allowed: false,
      reason: `${left.toLocaleString("en-IN")} ${left === 1 ? "mark is" : "marks are"} still to be entered.`,
    };
  }
  return { allowed: true, reason: null };
}
