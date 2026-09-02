/**
 * The shape of a school: its classes, its sections, its subjects. Pure.
 *
 * These rules already existed, twice over in spirit: the Excel importer had to
 * decide what "8", "VIII" and "class 8" all meant, and in what order Nursery, LKG
 * and Class 10 belong. They lived as private helpers inside a "use server" module,
 * which cannot export anything but async functions — so the office screens that
 * now create classes by hand would have had to copy them. Two copies of "what does
 * this class name mean" is how a school ends up with "Class 8" and "class 8" as
 * separate classes, each with half the children in it.
 *
 * Deleting is the other half. A class or section that anything at all hangs off —
 * a child, a mark, a period on the timetable — must not be removable, because the
 * office clicking tidy-up should never be able to orphan a report card.
 */

export type SetupCheck = { allowed: boolean; reason: string | null };

const ALLOWED: SetupCheck = { allowed: true, reason: null };
const refuse = (reason: string): SetupCheck => ({ allowed: false, reason });

/**
 * What a school means when it types a class name.
 * "8" → "Class 8" · "class  8" → "Class 8" · "nursery" → "Nursery" · "lkg" → "LKG"
 */
/**
 * Excel and copy-paste leave characters that look like spaces and are not.
 * A non-breaking space or a zero-width joiner inside "Class 5" produces a name
 * that matches nothing and looks identical to the one that does, which is the
 * worst kind of import bug: the clerk sees the right text and the wrong result.
 */
export function scrubCell(raw: string): string {
  return raw
    .replace(/[\u00A0\u2007\u202F]/g, " ") // non-breaking / figure / narrow no-break space
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width space, joiner, non-joiner, BOM
    .replace(/\s+/g, " ")
    .trim();
}

const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6,
  vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12,
};

const PRE_PRIMARY = /^(nursery|lkg|ukg|pre-?kg|pre-?nursery|prep|play\s?group|kg)$/i;

/** The number a class token means, or null. Handles 5, V, and 5th alike. */
function classNumber(token: string): number | null {
  const t = token.toLowerCase();
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= 12 ? n : null;
  }
  const ordinal = t.match(/^(\d{1,2})(st|nd|rd|th)$/);
  if (ordinal) {
    const n = Number(ordinal[1]);
    return n >= 1 && n <= 12 ? n : null;
  }
  return ROMAN[t] ?? null;
}

export type ClassParse = {
  className: string | null;
  sectionName: string | null;
  /** Text that was recognised and deliberately not used. Shown, never dropped silently. */
  ignored: string | null;
};

/**
 * What a school's own spreadsheet means by one cell in the Class column.
 *
 * Real files carry the section inside it — "V-B", "10A", "IX C" — and until this
 * existed each of those became its own CLASS. A school with 10A, 10B and 10C
 * ended up with three classes of one section each, which then breaks the
 * timetable, the report cards and every per-class count, and is tedious to undo
 * by hand across 600 children. That is the bug this function exists for.
 *
 * Roman numerals and ordinals are the other half: "V" and "5th" are the same
 * class as "5" to everyone except a string comparison.
 *
 * A leftover longer than a section letter — the "Science" in "XII Science" — is
 * NOT guessed at. It is returned in `ignored` so the clerk is told, because a
 * stream is not a section and inventing one would put a child in a class that
 * does not exist.
 */
export function parseClassAndSection(raw: string): ClassParse {
  const t = scrubCell(raw).replace(/^(class|std|standard|grade|cls)[\s.:-]*/i, "");
  if (t === "") return { className: null, sectionName: null, ignored: null };

  // Split on the separators schools actually type, including none at all
  // ("10B"), which is why the digits case is matched before the general split.
  const glued = t.match(/^(\d{1,2})\s*([A-Za-z])$/);
  const parts = glued
    ? [glued[1], glued[2]]
    : t.split(/[\s\-–—/.()|,]+/).filter((x) => x !== "");

  const head = parts[0] ?? "";
  const rest = parts.slice(1).join(" ").trim();

  if (PRE_PRIMARY.test(head)) {
    const name = head.toLowerCase() === "nursery" ? "Nursery" : head.toUpperCase();
    return {
      className: name,
      sectionName: rest.length > 0 && rest.length <= 2 ? rest.toUpperCase() : null,
      ignored: rest.length > 2 ? rest : null,
    };
  }

  const n = classNumber(head);
  if (n === null) {
    // Not a class at all — a stray "A", a blank-ish marker, a note. Say so
    // rather than creating a class named after it.
    return { className: null, sectionName: null, ignored: t };
  }

  return {
    className: `Class ${n}`,
    sectionName: /^[A-Za-z]{1,2}$/.test(rest) ? rest.toUpperCase() : null,
    ignored: rest.length > 0 && !/^[A-Za-z]{1,2}$/.test(rest) ? rest : null,
  };
}

/** "5" / "V" / "5th" / "Grade 5" / "10B" all become "Class 5" (or "Class 10"). */
export function tidyClassName(raw: string): string {
  const parsed = parseClassAndSection(raw);
  if (parsed.className) return parsed.className;
  // Unrecognised, so it is left as the school typed it rather than mangled —
  // a school is allowed a class we have never heard of.
  return scrubCell(raw).replace(/^class\s*/i, "Class ");
}

/**
 * Where a class sits in the school, so a dropdown reads Nursery → Class 12 rather
 * than alphabetically, which puts Class 10 before Class 2.
 */
export function classOrderFor(raw: string): number {
  const t = scrubCell(raw).toLowerCase();
  if (t.includes("play")) return -3;
  if (t.includes("pre")) return -2;
  if (t.includes("nursery")) return 0;
  if (t.includes("lkg")) return 1;
  if (t.includes("ukg")) return 2;
  // Via the parser, so "IX" sorts as 9 rather than falling to 99 with every
  // other Roman-numeral class and burying them together at the end.
  const parsed = parseClassAndSection(raw);
  if (parsed.className) {
    const n = Number(parsed.className.replace(/\D/g, ""));
    if (Number.isFinite(n) && n > 0) return n + 2;
  }
  const n = Number(t.replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n + 2 : 99;
}

/** Sections are letters in an Indian school: "a" → "A", "sec b" → "B". */
export function tidySectionName(raw: string): string {
  const t = raw.trim().replace(/^(sec(tion)?|div(ision)?)[\s.-]*/i, "");
  return t.length <= 2 ? t.toUpperCase() : t.replace(/\s+/g, " ");
}

export function validateClassName(raw: string, existing: string[] = []): SetupCheck {
  const name = tidyClassName(raw);
  if (name === "") return refuse("Give the class a name.");
  if (name.length > 30) return refuse("That class name is too long to fit on a report card.");
  if (existing.some((e) => e.trim().toLowerCase() === name.toLowerCase())) {
    return refuse(`${name} already exists.`);
  }
  return ALLOWED;
}

export function validateSectionName(raw: string, existing: string[] = []): SetupCheck {
  const name = tidySectionName(raw);
  if (name === "") return refuse("Give the section a name — usually a single letter.");
  if (name.length > 12) return refuse("That section name is too long.");
  if (existing.some((e) => e.trim().toLowerCase() === name.toLowerCase())) {
    return refuse(`Section ${name} already exists in this class.`);
  }
  return ALLOWED;
}

/**
 * A section can only go if nothing hangs off it. The counts come from the caller;
 * the judgement — and the sentence a clerk reads — lives here.
 */
export function canDeleteSection(counts: {
  students: number;
  attendance: number;
  timetable: number;
  homework?: number;
}): SetupCheck {
  if (counts.students > 0) {
    return refuse(
      `${counts.students} ${counts.students === 1 ? "child is" : "children are"} in this section. Move them first — a section is not a way to remove students.`,
    );
  }
  if (counts.attendance > 0) return refuse("This section has attendance on record. It stays, so the register stays readable.");
  if (counts.timetable > 0) return refuse("This section still has periods on the timetable. Clear those first.");
  if ((counts.homework ?? 0) > 0) return refuse("Homework has been set for this section. It stays.");
  return ALLOWED;
}

export function canDeleteClass(counts: { students: number; sections: number; subjects: number }): SetupCheck {
  if (counts.students > 0) {
    return refuse(
      `${counts.students} ${counts.students === 1 ? "child is" : "children are"} in this class. Move them first.`,
    );
  }
  if (counts.sections > 0) return refuse("Remove the sections in this class first.");
  if (counts.subjects > 0) return refuse("Subjects are still attached to this class. Remove those first.");
  return ALLOWED;
}

/**
 * Whether this person can be a class teacher at all.
 *
 * Not a formality: the parent-to-class-teacher conversation in chat is built
 * entirely on Section.classTeacherId, so pointing it at somebody who has left the
 * school would silently break every one of those families' only line to the school.
 */
export function canBeClassTeacher(params: { isActiveStaff: boolean; roles: string[] }): SetupCheck {
  if (!params.isActiveStaff) return refuse("That member of staff has left the school.");
  if (!params.roles.includes("TEACHER") && !params.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r))) {
    return refuse("Only a teacher, or the office, can be a class teacher.");
  }
  return ALLOWED;
}

/** A subject name as a school writes it on a report card. */
export function tidySubjectName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function validateSubjectName(raw: string, existing: string[] = []): SetupCheck {
  const name = tidySubjectName(raw);
  if (name === "") return refuse("Give the subject a name.");
  if (name.length > 40) return refuse("That subject name will not fit on a report card.");
  if (existing.some((e) => e.trim().toLowerCase() === name.toLowerCase())) {
    return refuse(`${name} is already a subject in this class.`);
  }
  return ALLOWED;
}

/**
 * A subject can go only while nothing academic points at it. Staff mappings are not
 * academic records — they are just who teaches what, and they go with the subject.
 */
export function canDeleteSubject(counts: {
  exams: number;
  timetable: number;
  homework: number;
  lessonPlans: number;
}): SetupCheck {
  if (counts.exams > 0) {
    return refuse(
      `${counts.exams} exam ${counts.exams === 1 ? "paper" : "papers"} already exist for this subject. Marks and report cards refer to them.`,
    );
  }
  if (counts.timetable > 0) return refuse("This subject still has periods on the timetable. Clear those first.");
  if (counts.homework > 0) return refuse("Homework has been set for this subject. It stays.");
  if (counts.lessonPlans > 0) return refuse("Lesson plans refer to this subject. They stay.");
  return ALLOWED;
}

/** What a school charges for: Tuition Fee, Transport, Lab, Exam. */
export function validateFeeHeadName(raw: string, existing: string[] = []): SetupCheck {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name === "") return refuse("Give the fee head a name.");
  if (name.length > 40) return refuse("That name will not fit on a receipt.");
  if (existing.some((e) => e.trim().toLowerCase() === name.toLowerCase())) {
    return refuse(`${name} is already a fee head.`);
  }
  return ALLOWED;
}

/**
 * A fee head can go only while no class charges it. Removing one that is priced
 * would silently change what a class owes, and invoices already raised name the
 * head on the parent's receipt.
 */
export function canDeleteFeeHead(counts: { items: number }): SetupCheck {
  if (counts.items > 0) {
    return refuse(
      `${counts.items} ${counts.items === 1 ? "class charges" : "classes charge"} this head. Set those amounts to zero first.`,
    );
  }
  return ALLOWED;
}

/**
 * An amount a school types against a fee head, in paise.
 *
 * The upper bound is an absurdity guard, not a judgement about school fees: a
 * misplaced zero on an annual tuition line is the kind of typo that reaches a
 * parent as an invoice, and ₹50 lakh for one head in one year is past the point
 * where somebody should be asked to look again.
 */
export function validateFeeAmount(amountPaise: number | null): SetupCheck {
  if (amountPaise == null) return refuse("That is not an amount.");
  if (!Number.isInteger(amountPaise)) return refuse("That amount is not a whole number of paise.");
  if (amountPaise < 0) return refuse("A fee cannot be negative. Use a concession instead.");
  if (amountPaise > 5_000_000_00) return refuse("That is over ₹50 lakh for one head — check the zeroes.");
  return ALLOWED;
}
