/**
 * Setting homework. Pure.
 *
 * The screen listed homework and every parent's home screen showed it, but nothing
 * could create any — so the one thing a teacher does every single day was the one
 * thing they could not do.
 *
 * Who may set it is the same judgement chat-core makes about who a teacher may
 * message, and for the same reason: `StaffSubject` carries no section and no school,
 * so "teaches Maths" would hand a teacher every class in the building. Only
 * `TimetableEntry.sectionId` and `Section.classTeacherId` decide reach.
 */

export type HomeworkField = "title" | "details" | "assignedOn" | "dueOn" | "section" | "maxMarks";
export type HomeworkMessage = { field: HomeworkField; level: "ERROR" | "WARNING"; message: string };
export type HomeworkCheck = { ok: boolean; messages: HomeworkMessage[] };
export type HomeworkGuard = { allowed: boolean; reason: string | null };
export type HomeworkStatusValue = "DRAFT" | "ASSIGNED" | "CLOSED";

const DAY = 86_400_000;
const at = (s: string) => new Date(`${s}T00:00:00.000Z`).getTime();

export function validateHomework(params: {
  title?: string | null;
  details?: string | null;
  assignedIso?: string | null;
  dueIso?: string | null;
  todayIso: string;
  maxMarks?: number | null;
}): HomeworkCheck {
  const messages: HomeworkMessage[] = [];

  if (params.maxMarks != null) {
    if (!Number.isInteger(params.maxMarks) || params.maxMarks <= 0) {
      messages.push({ field: "maxMarks", level: "ERROR", message: "Marks out of must be a whole number greater than zero." });
    } else if (params.maxMarks > 1000) {
      messages.push({ field: "maxMarks", level: "ERROR", message: "That is over 1000 marks for one piece of homework — check the number." });
    }
  }

  const title = (params.title ?? "").trim();
  if (title === "") messages.push({ field: "title", level: "ERROR", message: "Give the homework a title." });
  else if (title.length > 120) messages.push({ field: "title", level: "ERROR", message: "That title is too long for a parent's screen." });

  if ((params.details ?? "").length > 4000) {
    messages.push({ field: "details", level: "ERROR", message: "That is too long. Attach a sheet instead." });
  }

  const today = at(params.todayIso);
  const assigned = params.assignedIso ? at(params.assignedIso) : today;
  if (params.assignedIso && !Number.isFinite(assigned)) {
    messages.push({ field: "assignedOn", level: "ERROR", message: "That is not a date." });
  } else if (assigned > today + 30 * DAY) {
    messages.push({ field: "assignedOn", level: "ERROR", message: "That is more than a month ahead." });
  }

  if (params.dueIso) {
    const due = at(params.dueIso);
    if (!Number.isFinite(due)) {
      messages.push({ field: "dueOn", level: "ERROR", message: "That is not a date." });
    } else if (due < assigned) {
      messages.push({ field: "dueOn", level: "ERROR", message: "It cannot be due before it is set." });
    } else if (due > assigned + 90 * DAY) {
      messages.push({ field: "dueOn", level: "WARNING", message: "Due more than three months later — check the date." });
    } else if (new Date(due).getUTCDay() === 0) {
      // Not an error: plenty of teachers do want it in by Monday and write Sunday by
      // mistake. Worth a word before every parent in the section reads it.
      messages.push({ field: "dueOn", level: "WARNING", message: "That is a Sunday. Did you mean the Monday?" });
    }
  }

  return { ok: messages.every((m) => m.level !== "ERROR"), messages };
}

/**
 * Whether this person may set homework for this section.
 *
 * A principal or other office role may set homework only where they actually stand
 * in front of a class themselves — same rule as a teacher: a section they are class
 * teacher of, or one they have a period with. Covering an absence is ordinary;
 * setting homework for a class they never teach is not. Office keeps full read
 * access to every section's homework regardless — this guard is about creating it,
 * not seeing it.
 */
export function canSetHomework(params: {
  roles: string[];
  classTeacherOfSectionIds: string[];
  teachesSectionIds: string[];
  sectionId: string | null;
  isActiveStaff: boolean;
}): HomeworkGuard {
  if (!params.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN", "TEACHER"].includes(r))) {
    return { allowed: false, reason: "Only a teacher or the office can set homework." };
  }
  if (!params.isActiveStaff) {
    return { allowed: false, reason: "That member of staff has left the school." };
  }
  if (!params.sectionId) {
    return { allowed: false, reason: "Choose the section this is for." };
  }
  if (
    !params.classTeacherOfSectionIds.includes(params.sectionId) &&
    !params.teachesSectionIds.includes(params.sectionId)
  ) {
    return { allowed: false, reason: "You do not teach that section." };
  }
  return { allowed: true, reason: null };
}

/** Homework with work handed in against it stays — a child's submission is theirs. */
export function canDeleteHomework(counts: { submissions: number }): HomeworkGuard {
  if (counts.submissions > 0) {
    return {
      allowed: false,
      reason: `${counts.submissions} ${counts.submissions === 1 ? "child has" : "children have"} handed this in. It stays.`,
    };
  }
  return { allowed: true, reason: null };
}

/** The due date a teacher almost always means: tomorrow, or Monday if that is a Sunday. */
export function defaultDueDate(todayIso: string): string {
  const t = at(todayIso);
  if (!Number.isFinite(t)) return todayIso;
  let due = t + DAY;
  if (new Date(due).getUTCDay() === 0) due += DAY;
  return new Date(due).toISOString().slice(0, 10);
}

/**
 * Lifecycle and grading — no AI in this loop, so "graded" has exactly one
 * meaning: a teacher looked at the submission and entered a mark or a note.
 *
 *   Homework.status:             DRAFT ──publish──▶ ASSIGNED ──close──▶ CLOSED
 *   HomeworkSubmission:  (none) ──submit──▶ PENDING ──grade──▶ GRADED
 *
 * PENDING/GRADED is derived from `marks !== null`, not stored — a second flag
 * that could disagree with the marks describing it is worse than not having it.
 */

/** DRAFT → ASSIGNED. Only the person who could have set this homework may publish it. */
export function canPublishHomework(params: { status: HomeworkStatusValue }): HomeworkGuard {
  if (params.status !== "DRAFT") {
    return { allowed: false, reason: params.status === "CLOSED" ? "This is already closed." : "This is already set — students can see it." };
  }
  return { allowed: true, reason: null };
}

/** ASSIGNED → CLOSED. Stops new submissions; already-handed-in work is untouched. */
export function canCloseHomework(params: { status: HomeworkStatusValue }): HomeworkGuard {
  if (params.status === "DRAFT") return { allowed: false, reason: "This has not been set yet — there is nothing to close." };
  if (params.status === "CLOSED") return { allowed: false, reason: "This is already closed." };
  return { allowed: true, reason: null };
}

/**
 * Whether a student may hand this in. A DRAFT was never shown to them and a
 * CLOSED homework has stopped taking submissions — both refuse the same way an
 * empty answer would, by naming what actually happened rather than a generic
 * "not allowed".
 */
export function canSubmitHomework(params: {
  status: HomeworkStatusValue;
  studentSectionId: string | null;
  homeworkSectionId: string | null;
  homeworkClassId: string;
  studentClassId: string | null;
  alreadySubmitted: boolean;
}): HomeworkGuard {
  if (params.status === "DRAFT") return { allowed: false, reason: "This has not been set yet." };
  if (params.status === "CLOSED") return { allowed: false, reason: "This homework is closed — it is no longer taking submissions." };
  if (params.alreadySubmitted) return { allowed: false, reason: "You have already handed this in." };
  if (params.homeworkSectionId) {
    if (params.studentSectionId !== params.homeworkSectionId) {
      return { allowed: false, reason: "This was not set for your section." };
    }
  } else if (params.studentClassId !== params.homeworkClassId) {
    return { allowed: false, reason: "This was not set for your class." };
  }
  return { allowed: true, reason: null };
}

/** A submission needs something in it — a blank tap is not a submission. */
export function validateSubmission(params: { note?: string | null; fileUrl?: string | null }): HomeworkGuard {
  const note = (params.note ?? "").trim();
  const file = (params.fileUrl ?? "").trim();
  if (!note && !file) {
    return { allowed: false, reason: "Write something or attach a photo before handing it in." };
  }
  if (note.length > 4000) {
    return { allowed: false, reason: "That is too long. Attach a photo instead." };
  }
  return { allowed: true, reason: null };
}

/**
 * A mark that does not fit what the homework was out of is refused rather than
 * silently clamped — 42 out of 20 is a typo, not a generous score, and a report
 * that a parent reads should never show a percentage over 100.
 */
export function validateMarks(params: { marks: number | null; maxMarks: number | null }): HomeworkGuard {
  if (params.marks == null) return { allowed: true, reason: null };
  if (!Number.isFinite(params.marks) || !Number.isInteger(params.marks)) {
    return { allowed: false, reason: "Marks must be a whole number." };
  }
  if (params.marks < 0) {
    return { allowed: false, reason: "Marks cannot be negative." };
  }
  if (params.maxMarks != null && params.marks > params.maxMarks) {
    return { allowed: false, reason: `That is more than the ${params.maxMarks} this is out of.` };
  }
  return { allowed: true, reason: null };
}
