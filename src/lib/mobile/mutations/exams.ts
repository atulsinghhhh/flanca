import { db } from "@/lib/db";
import { audit, hasRole, OFFICE, type Actor } from "@/lib/session";
import { CBSE_8_POINT, gradeFor, percentBp } from "@/lib/core/grading-core";

export type MarkEntryInput = { studentId: string; marks: number | null; isAbsent: boolean };

export type SaveMarksResult =
  | { ok: false; status: number; code: string; message: string }
  | { ok: true; entered: number };

/** Is this account the class teacher of any section in this class? Exams are class-scoped, not section-scoped, and a class can have several sections each with their own class teacher. */
export async function isClassTeacherOf(actor: Actor, classId: string | null): Promise<boolean> {
  if (!classId) return false;
  const section = await db.section.findFirst({
    where: { schoolId: actor.schoolId, classId, classTeacherId: actor.id },
    select: { id: true },
  });
  return section != null;
}

/** Does this account actually teach this subject to this class, per the
 * timetable? Mirrors chat.ts's subjectGroupMembers — TimetableEntry is the
 * source of truth for who teaches what, never StaffSubject (no section/class
 * scoping, would hand every subject teacher in the school access). */
export async function isSubjectTeacherOf(actor: Actor, classId: string | null, subjectId: string | null): Promise<boolean> {
  if (!classId || !subjectId) return false;
  const entry = await db.timetableEntry.findFirst({
    where: { schoolId: actor.schoolId, classId, subjectId, staff: { userId: actor.id } },
    select: { id: true },
  });
  return entry != null;
}

/**
 * The mobile-API twin of src/app/app/exams/actions.ts::saveMarks — same
 * idempotent upsert-by-(exam,student), same max-marks validation done here
 * on the server so a typo never reaches a report card.
 */
export async function saveMarksForActor(
  actor: Actor,
  examId: string,
  entries: MarkEntryInput[],
): Promise<SaveMarksResult> {
  const exam = await db.exam.findFirst({
    where: { id: examId, schoolId: actor.schoolId },
    include: {
      subject: { select: { name: true } },
      class: { select: { name: true } },
      examTerm: { select: { name: true, isPublished: true } },
    },
  });
  if (!exam) return { ok: false, status: 404, code: "not_found", message: "That exam is not in this school." };

  const allowed =
    hasRole(actor, ...OFFICE) ||
    (await isClassTeacherOf(actor, exam.classId)) ||
    (await isSubjectTeacherOf(actor, exam.classId, exam.subjectId));
  if (!allowed) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "Only that class's class teacher or this subject's teacher can enter its marks.",
    };
  }

  const roll = await db.student.findMany({
    where: { schoolId: actor.schoolId, classId: exam.classId ?? undefined, status: "ACTIVE" },
    select: { id: true },
  });
  const onRoll = new Set(roll.map((r) => r.id));

  const problems: string[] = [];
  const accepted = entries.filter((e) => {
    if (!onRoll.has(e.studentId)) return false;
    if (e.marks == null) return true;
    if (!Number.isFinite(e.marks) || e.marks < 0) {
      problems.push("A mark cannot be negative.");
      return false;
    }
    if (e.marks > exam.maxMarks) {
      problems.push(`${e.marks} is above the maximum of ${exam.maxMarks}.`);
      return false;
    }
    return true;
  });

  if (problems.length > 0) {
    return { ok: false, status: 422, code: "invalid_marks", message: [...new Set(problems)].join(" ") };
  }

  let entered = 0;

  await db.$transaction(
    async (tx) => {
      for (const e of accepted) {
        const grade =
          e.isAbsent || e.marks == null ? null : (gradeFor(percentBp(e.marks, exam.maxMarks), CBSE_8_POINT)?.grade ?? null);

        await tx.examResult.upsert({
          where: { examId_studentId: { examId: exam.id, studentId: e.studentId } },
          create: {
            schoolId: actor.schoolId,
            examId: exam.id,
            studentId: e.studentId,
            marks: e.isAbsent ? null : e.marks,
            isAbsent: e.isAbsent,
            grade,
            state: exam.examTerm.isPublished ? "PUBLISHED" : "DRAFT",
            enteredBy: actor.id,
            clientKey: `mk:${exam.id}:${e.studentId}`,
          },
          update: {
            marks: e.isAbsent ? null : e.marks,
            isAbsent: e.isAbsent,
            grade,
            enteredBy: actor.id,
            enteredAt: new Date(),
          },
        });
        if (e.marks != null || e.isAbsent) entered++;
      }
    },
    { timeout: 60_000 },
  );

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "exam.marks.save",
    entity: "Exam",
    entityId: exam.id,
    summary: `Entered marks for ${exam.class?.name ?? ""} ${exam.subject?.name ?? ""} (${exam.examTerm.name}): ${entered} students`,
  });

  return { ok: true, entered };
}
