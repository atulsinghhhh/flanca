/**
 * Adding and correcting a student by hand. Pure.
 *
 * Until now every student in this product arrived from the seed or from an Excel
 * import, so the rules for what makes a student record acceptable lived only
 * inside the importer. A clerk typing a child in at the front desk must be held to
 * the same standard — the same required fields, the same phone rule, the same
 * refusal to guess a date — or the register quietly grows two classes of record:
 * the ones that were checked and the ones that were typed.
 *
 * Admission numbers are the other half. A school already has a numbering habit by
 * the time it reaches us, so the prefix is ADOPTED from what is already on the
 * roll rather than imposed, and only falls back to the school's initials when the
 * roll is empty.
 */

export type FieldMessage = { field: string; level: "ERROR" | "WARNING"; message: string };

export type StudentDetails = {
  name?: string | null;
  classId?: string | null;
  rollNumber?: number | null;
  dobIso?: string | null;
  gender?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  admissionNumber?: string | null;
  sectionId?: string | null;
  /** whether the chosen class has any sections at all — the caller knows, this cannot */
  classHasSections?: boolean;
};

export type StudentCheck = { ok: boolean; messages: FieldMessage[] };

/** A school year rarely admits anyone born this decade into Class 12, but we do not guess. */
const OLDEST_PLAUSIBLE_YEAR = 1990;

/**
 * The same rules the importer applies, for one typed record.
 *
 * Errors block the save. Warnings are stated and allowed through — a school with
 * a child whose father's mobile is a landline should still be able to admit them.
 */
export function validateStudentDetails(d: StudentDetails, today = new Date()): StudentCheck {
  const messages: FieldMessage[] = [];

  const name = (d.name ?? "").trim();
  if (name === "") {
    messages.push({ field: "name", level: "ERROR", message: "The student's name is required." });
  } else if (name.length < 2) {
    messages.push({ field: "name", level: "ERROR", message: "That name is too short to be a name." });
  }

  if (!d.classId) {
    messages.push({ field: "classId", level: "ERROR", message: "Choose the class the child is joining." });
  }

  // Not an error: a school really does admit a child before deciding which section
  // they will sit in. But attendance is marked per section, so until somebody
  // decides, that child is on the roll and on no register — present in the school
  // and invisible to the one screen a teacher opens every morning.
  if (d.classId && d.classHasSections && !d.sectionId) {
    messages.push({
      field: "sectionId",
      level: "WARNING",
      message: "Not in a section yet — this child will not appear on any attendance register until they are.",
    });
  }

  if (d.admissionNumber != null && d.admissionNumber.trim() !== "" && d.admissionNumber.trim().length < 2) {
    messages.push({
      field: "admissionNumber",
      level: "ERROR",
      message: "An admission number that short will not be unique for long — leave it blank and we will issue one.",
    });
  }

  if (d.rollNumber != null && (!Number.isInteger(d.rollNumber) || d.rollNumber < 1 || d.rollNumber > 200)) {
    messages.push({ field: "rollNumber", level: "ERROR", message: "A roll number is a whole number between 1 and 200." });
  }

  if (d.dobIso) {
    const dob = new Date(`${d.dobIso}T00:00:00Z`);
    if (Number.isNaN(dob.getTime())) {
      messages.push({ field: "dobIso", level: "ERROR", message: "That date of birth is not a date." });
    } else if (dob.getTime() > today.getTime()) {
      messages.push({ field: "dobIso", level: "ERROR", message: "A date of birth cannot be in the future." });
    } else if (dob.getUTCFullYear() < OLDEST_PLAUSIBLE_YEAR) {
      messages.push({
        field: "dobIso",
        level: "WARNING",
        message: `Born in ${dob.getUTCFullYear()} — check the year before the report cards are printed.`,
      });
    }
  }

  if (d.gender != null && d.gender !== "" && !["MALE", "FEMALE", "OTHER"].includes(d.gender)) {
    messages.push({ field: "gender", level: "ERROR", message: "That is not a gender we can record." });
  }

  const phone = digitsOf(d.guardianPhone);
  if (phone !== "" && phone.length !== 10) {
    messages.push({
      field: "guardianPhone",
      level: "WARNING",
      message: "That mobile is not 10 digits — the parent will not be reachable in the app.",
    });
  }

  const email = (d.guardianEmail ?? "").trim();
  if (email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    messages.push({ field: "guardianEmail", level: "WARNING", message: "That email address looks incomplete." });
  }

  return { ok: !messages.some((m) => m.level === "ERROR"), messages };
}

/** A mobile as the phone company sees it: ten digits, +91 and spaces stripped. */
export function digitsOf(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * The prefix a school already uses, read off an existing admission number.
 * "NPS/1848" → "NPS/" · "2026-014" → "2026-" · "1043" → "" (bare numbers).
 */
export function admissionPrefixFrom(params: { sample?: string | null; schoolName?: string | null }): string {
  const sample = (params.sample ?? "").trim();
  if (sample !== "") {
    const trailing = sample.match(/^(.*?)(\d+)\s*$/);
    if (trailing) return trailing[1];
    return "";
  }

  // Nothing on the roll yet: the school's initials, which is what a clerk would
  // have written on the ledger anyway.
  const initials = (params.schoolName ?? "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 4);

  return initials === "" ? "ADM/" : `${initials}/`;
}

/**
 * The highest number already used, so a new sequence starts after the roll rather
 * than on top of it. Compared NUMERICALLY on purpose: a lexicographic max thinks
 * "NPS/999" is greater than "NPS/1848", which would hand the next child a number
 * that already belongs to somebody.
 */
export function highestAdmissionSeq(numbers: Array<string | null | undefined>): number {
  let max = 0;
  for (const n of numbers) {
    const m = (n ?? "").match(/(\d+)\s*$/);
    if (!m) continue;
    const value = Number(m[1]);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max;
}
