import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import {
  canCloseHomework,
  canDeleteHomework,
  canPublishHomework,
  canSetHomework,
  canSubmitHomework,
  validateHomework,
  validateMarks,
  validateSubmission,
  type HomeworkMessage,
} from "@/lib/core/homework-core";
import { getChatPerson } from "@/lib/queries/chat";
import { schoolToday } from "@/lib/queries/when";

/**
 * The mobile-API twin of src/app/app/homework/actions.ts.
 *
 * Same reach checks (via getChatPerson + homework-core, never re-derived), same
 * db writes, same audit trail, same notification side-effects — just handed an
 * `actor` instead of calling `requireActor()`, and returning a discriminated
 * result instead of the `{error}`/`{ok}` shape a server action's caller expects,
 * so a route handler can turn it into the right HTTP status.
 *
 * revalidatePath is a Next.js page-cache concern with nothing to invalidate for
 * a stateless JSON client, so it is dropped here — everything else is preserved.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

type Failure = { ok: false; status: number; code: string; message: string };

const notFound = (message = "That homework is not in this school."): Failure => ({
  ok: false,
  status: 404,
  code: "not_found",
  message,
});
const noRole = (): Failure => ({
  ok: false,
  status: 403,
  code: "no_role",
  message: "You do not have a role at this school.",
});
const forbidden = (message: string): Failure => ({ ok: false, status: 403, code: "forbidden", message });
const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });
const conflict = (message: string): Failure => ({ ok: false, status: 409, code: "conflict", message });

/** Every reach check in this module is the same three calls, in the same order. */
async function reach(actor: Actor, sectionId: string | null) {
  const person = await getChatPerson(actor.schoolId, actor.id);
  if (!person) return { error: noRole() as Failure, person: null };
  const isOffice = person.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r));
  const guard = canSetHomework({
    roles: person.roles,
    classTeacherOfSectionIds: person.classTeacherOfSectionIds,
    teachesSectionIds: person.teachesSectionIds,
    sectionId,
    isActiveStaff: person.isActiveStaff || isOffice,
  });
  if (!guard.allowed) return { error: forbidden(guard.reason!) as Failure, person: null };
  return { error: null, person };
}

export type SetHomeworkInput = {
  sectionId: string;
  subjectId?: string | null;
  title: string;
  details?: string | null;
  assignedIso?: string | null;
  dueIso?: string | null;
  maxMarks?: number | null;
  publish?: boolean;
};

export type SetHomeworkResult = Failure | { ok: true; homeworkId: string; messages: HomeworkMessage[] };

export async function setHomeworkForActor(actor: Actor, input: SetHomeworkInput): Promise<SetHomeworkResult> {
  const today = schoolToday();
  const check = validateHomework({
    title: input.title,
    details: input.details ?? null,
    assignedIso: input.assignedIso ?? null,
    dueIso: input.dueIso ?? null,
    todayIso: iso(today),
    maxMarks: input.maxMarks ?? null,
  });
  if (!check.ok) {
    return invalid(check.messages.find((m) => m.level === "ERROR")!.message);
  }

  const section = await db.section.findFirst({
    where: { id: input.sectionId, schoolId: actor.schoolId },
    select: { id: true, name: true, classId: true, class: { select: { name: true } } },
  });
  if (!section) return notFound("That section is not in this school.");

  const { error, person } = await reach(actor, section.id);
  if (error) return error;

  if (input.subjectId) {
    const subject = await db.subject.findFirst({
      where: { id: input.subjectId, schoolId: actor.schoolId },
      select: { id: true, classId: true, name: true },
    });
    if (!subject) return notFound("That subject is not in this school.");
    if (subject.classId && subject.classId !== section.classId) {
      return invalid(`${subject.name} is not taught in ${section.class?.name ?? "that class"}.`);
    }
  }

  const publish = input.publish ?? true;

  const made = await db.homework.create({
    data: {
      schoolId: actor.schoolId,
      classId: section.classId,
      sectionId: section.id,
      subjectId: input.subjectId || null,
      staffId: person!.staffId,
      title: input.title.trim().replace(/\s+/g, " "),
      details: input.details?.trim() || null,
      assignedOn: input.assignedIso ? asDate(input.assignedIso) : today,
      dueOn: input.dueIso ? asDate(input.dueIso) : null,
      maxMarks: input.maxMarks ?? null,
      status: publish ? "ASSIGNED" : "DRAFT",
      assignedAt: publish ? new Date() : null,
    },
    select: { id: true, title: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: publish ? "homework.set" : "homework.draft",
    entity: "Homework",
    entityId: made.id,
    summary:
      (publish
        ? `Set homework for ${section.class?.name ?? ""} ${section.name}: ${made.title}`
        : `Drafted homework for ${section.class?.name ?? ""} ${section.name}: ${made.title}`
      ).trim() + (input.dueIso ? `, due ${input.dueIso}` : ""),
  });

  if (publish) {
    const students = await db.student.findMany({
      where: { schoolId: actor.schoolId, sectionId: section.id, status: "ACTIVE", userId: { not: null } },
      select: { userId: true },
    });
    if (students.length > 0) {
      await db.notification.createMany({
        data: students.map((s) => ({
          schoolId: actor.schoolId,
          userId: s.userId as string,
          kind: "HOMEWORK",
          title: "New homework",
          body: made.title,
          linkUrl: `/app/homework/${made.id}`,
        })),
        skipDuplicates: true,
      });
    }
  }

  return { ok: true, homeworkId: made.id, messages: check.messages };
}

export type SimpleResult = Failure | { ok: true };

/** DRAFT → ASSIGNED. Posts it to students the moment it goes live. */
export async function publishHomeworkForActor(actor: Actor, homeworkId: string): Promise<SimpleResult> {
  const hw = await db.homework.findFirst({
    where: { id: homeworkId, schoolId: actor.schoolId },
    select: {
      id: true, title: true, status: true, sectionId: true, classId: true,
      section: { select: { id: true, name: true, class: { select: { name: true } } } },
    },
  });
  if (!hw) return notFound();

  const { error } = await reach(actor, hw.sectionId);
  if (error) return error;

  const canGo = canPublishHomework({ status: hw.status });
  if (!canGo.allowed) return conflict(canGo.reason!);

  await db.homework.update({ where: { id: hw.id }, data: { status: "ASSIGNED", assignedAt: new Date() } });

  if (hw.sectionId) {
    const students = await db.student.findMany({
      where: { schoolId: actor.schoolId, sectionId: hw.sectionId, status: "ACTIVE", userId: { not: null } },
      select: { userId: true },
    });
    if (students.length > 0) {
      await db.notification.createMany({
        data: students.map((s) => ({
          schoolId: actor.schoolId,
          userId: s.userId as string,
          kind: "HOMEWORK",
          title: "New homework",
          body: hw.title,
          linkUrl: `/app/homework/${hw.id}`,
        })),
        skipDuplicates: true,
      });
    }
  }

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "homework.publish",
    entity: "Homework",
    entityId: hw.id,
    summary: `Published the draft "${hw.title}" for ${hw.section?.class?.name ?? ""} ${hw.section?.name ?? ""}`.trim(),
  });

  return { ok: true };
}

/** ASSIGNED → CLOSED. Stops new submissions; already-handed-in work stays. */
export async function closeHomeworkForActor(actor: Actor, homeworkId: string): Promise<SimpleResult> {
  const hw = await db.homework.findFirst({
    where: { id: homeworkId, schoolId: actor.schoolId },
    select: {
      id: true, title: true, status: true, sectionId: true,
      section: { select: { name: true, class: { select: { name: true } } } },
    },
  });
  if (!hw) return notFound();

  const { error } = await reach(actor, hw.sectionId);
  if (error) return error;

  const canGo = canCloseHomework({ status: hw.status });
  if (!canGo.allowed) return conflict(canGo.reason!);

  await db.homework.update({ where: { id: hw.id }, data: { status: "CLOSED", closedAt: new Date() } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "homework.close",
    entity: "Homework",
    entityId: hw.id,
    summary: `Closed "${hw.title}" for ${hw.section?.class?.name ?? ""} ${hw.section?.name ?? ""} — no longer taking submissions`.trim(),
  });

  return { ok: true };
}

export type SubmitInput = { note?: string | null; fileUrl?: string | null };

/** A student handing in their own work. One submission, ever. */
export async function submitHomeworkForActor(actor: Actor, homeworkId: string, input: SubmitInput): Promise<SimpleResult> {
  const hw = await db.homework.findFirst({
    where: { id: homeworkId, schoolId: actor.schoolId },
    select: { id: true, title: true, status: true, sectionId: true, classId: true, staffId: true },
  });
  if (!hw) return notFound();

  const student = await db.student.findFirst({
    where: { schoolId: actor.schoolId, userId: actor.id },
    select: { id: true, name: true, classId: true, sectionId: true },
  });
  if (!student) return { ok: false, status: 403, code: "not_a_student", message: "Only a student can hand in homework." };

  const already = await db.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId: hw.id, studentId: student.id } },
    select: { id: true },
  });

  const guard = canSubmitHomework({
    status: hw.status,
    studentSectionId: student.sectionId,
    homeworkSectionId: hw.sectionId,
    homeworkClassId: hw.classId,
    studentClassId: student.classId,
    alreadySubmitted: Boolean(already),
  });
  if (!guard.allowed) return conflict(guard.reason!);

  const valid = validateSubmission({ note: input.note ?? null, fileUrl: input.fileUrl ?? null });
  if (!valid.allowed) return invalid(valid.reason!);

  const made = await db.homeworkSubmission.create({
    data: {
      homeworkId: hw.id,
      studentId: student.id,
      note: input.note?.trim() || null,
      fileUrl: input.fileUrl?.trim() || null,
    },
    select: { id: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "homework.submit",
    entity: "HomeworkSubmission",
    entityId: made.id,
    summary: `${student.name} handed in "${hw.title}"`,
  });

  if (hw.staffId) {
    const teacher = await db.staff.findUnique({ where: { id: hw.staffId }, select: { userId: true } });
    if (teacher) {
      await db.notification.create({
        data: {
          schoolId: actor.schoolId,
          userId: teacher.userId,
          kind: "HOMEWORK",
          title: "Homework handed in",
          body: `${student.name} submitted "${hw.title}"`,
          linkUrl: `/app/homework/${hw.id}`,
        },
      });
    }
  }

  return { ok: true };
}

export type GradeInput = { marks?: number | null; feedback?: string | null };

/** A teacher entering a mark and a note. May be run again to correct what they typed. */
export async function gradeSubmissionForActor(actor: Actor, submissionId: string, input: GradeInput): Promise<SimpleResult> {
  const sub = await db.homeworkSubmission.findFirst({
    where: { id: submissionId, homework: { schoolId: actor.schoolId } },
    select: {
      id: true,
      marks: true,
      studentId: true,
      student: { select: { name: true } },
      homework: { select: { id: true, title: true, sectionId: true, maxMarks: true } },
    },
  });
  if (!sub) return { ok: false, status: 404, code: "not_found", message: "That submission is not in this school." };

  const { error } = await reach(actor, sub.homework.sectionId);
  if (error) return error;

  const marks = input.marks == null ? null : Math.trunc(input.marks);
  const valid = validateMarks({ marks, maxMarks: sub.homework.maxMarks });
  if (!valid.allowed) return invalid(valid.reason!);

  await db.homeworkSubmission.update({
    where: { id: sub.id },
    data: {
      marks,
      feedback: input.feedback?.trim() || null,
      gradedAt: new Date(),
      gradedByUserId: actor.id,
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "homework.grade",
    entity: "HomeworkSubmission",
    entityId: sub.id,
    summary:
      `Graded ${sub.student.name}'s "${sub.homework.title}"` +
      (marks != null ? `: ${marks}${sub.homework.maxMarks ? `/${sub.homework.maxMarks}` : ""}` : ""),
    before: { marks: sub.marks },
    after: { marks },
    reversible: true,
  });

  const [studentUser, parents] = await Promise.all([
    db.student.findUnique({ where: { id: sub.studentId }, select: { userId: true } }),
    db.parentLink.findMany({ where: { schoolId: actor.schoolId, studentId: sub.studentId }, select: { userId: true } }),
  ]);
  const recipients = new Set<string>();
  if (studentUser?.userId) recipients.add(studentUser.userId);
  parents.forEach((p) => recipients.add(p.userId));

  if (recipients.size > 0) {
    await db.notification.createMany({
      data: [...recipients].map((userId) => ({
        schoolId: actor.schoolId,
        userId,
        kind: "HOMEWORK",
        title: "Homework graded",
        body: `"${sub.homework.title}" — ${marks != null ? `${marks}${sub.homework.maxMarks ? `/${sub.homework.maxMarks}` : ""}` : "reviewed"}`,
        linkUrl: `/app/homework/${sub.homework.id}`,
      })),
      skipDuplicates: true,
    });
  }

  return { ok: true };
}

export type UpdateHomeworkInput = { title: string; details?: string | null; dueIso?: string | null };
export type UpdateHomeworkResult = Failure | { ok: true; messages: HomeworkMessage[] };

export async function updateHomeworkForActor(actor: Actor, homeworkId: string, input: UpdateHomeworkInput): Promise<UpdateHomeworkResult> {
  const hw = await db.homework.findFirst({
    where: { id: homeworkId, schoolId: actor.schoolId },
    select: {
      id: true, title: true, details: true, dueOn: true, assignedOn: true, sectionId: true,
      section: { select: { name: true, class: { select: { name: true } } } },
    },
  });
  if (!hw) return notFound();

  const check = validateHomework({
    title: input.title,
    details: input.details ?? null,
    assignedIso: iso(hw.assignedOn),
    dueIso: input.dueIso ?? null,
    todayIso: iso(schoolToday()),
  });
  if (!check.ok) {
    return invalid(check.messages.find((m) => m.level === "ERROR")!.message);
  }

  const { error } = await reach(actor, hw.sectionId);
  if (error) return error;

  await db.homework.update({
    where: { id: hw.id },
    data: {
      title: input.title.trim().replace(/\s+/g, " "),
      details: input.details?.trim() || null,
      dueOn: input.dueIso ? asDate(input.dueIso) : null,
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "homework.update",
    entity: "Homework",
    entityId: hw.id,
    summary: `Changed the homework "${hw.title}" for ${hw.section?.class?.name ?? ""} ${hw.section?.name ?? ""}`.trim(),
    before: { title: hw.title, details: hw.details, dueOn: hw.dueOn ? iso(hw.dueOn) : null },
    after: { title: input.title.trim(), details: input.details ?? null, dueOn: input.dueIso ?? null },
    reversible: true,
  });

  return { ok: true, messages: check.messages };
}

export async function deleteHomeworkForActor(actor: Actor, homeworkId: string): Promise<SimpleResult> {
  const hw = await db.homework.findFirst({
    where: { id: homeworkId, schoolId: actor.schoolId },
    select: {
      id: true, title: true, sectionId: true,
      _count: { select: { submissions: true } },
      section: { select: { name: true, class: { select: { name: true } } } },
    },
  });
  if (!hw) return notFound();

  const { error } = await reach(actor, hw.sectionId);
  if (error) return error;

  const canGo = canDeleteHomework({ submissions: hw._count.submissions });
  if (!canGo.allowed) return conflict(canGo.reason!);

  await db.homework.delete({ where: { id: hw.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "homework.delete",
    entity: "Homework",
    entityId: hw.id,
    summary: `Removed the homework "${hw.title}" for ${hw.section?.class?.name ?? ""} ${hw.section?.name ?? ""}, which nobody had handed in`.trim(),
  });

  return { ok: true };
}
