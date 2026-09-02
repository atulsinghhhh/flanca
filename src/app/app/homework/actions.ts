"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireActor } from "@/lib/session";
import {
  canCloseHomework,
  canDeleteHomework,
  canPublishHomework,
  canSetHomework,
  canSubmitHomework,
  validateHomework,
  validateMarks,
  validateSubmission,
} from "@/lib/core/homework-core";
import { getChatPerson } from "@/lib/queries/chat";
import { schoolToday } from "@/lib/queries/when";

/**
 * Setting homework.
 *
 * The one thing a teacher does every single day, and the one thing they could not
 * do: the screen listed homework and every parent's home screen showed it, but
 * nothing in the product created any.
 *
 * Reach is resolved by `getChatPerson`, not re-derived here — it already navigates
 * the two id spaces correctly (Section.classTeacherId is a User, TimetableEntry
 * .staffId is a Staff) and already knows to ignore StaffSubject, which carries no
 * section and would hand a teacher every class in the building.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

export async function setHomework(input: {
  sectionId: string;
  subjectId?: string | null;
  title: string;
  details?: string | null;
  assignedIso?: string | null;
  dueIso?: string | null;
  maxMarks?: number | null;
  /** false saves it as a DRAFT — visible only to the teacher/office, no student or parent sees it. */
  publish?: boolean;
}) {
  const actor = await requireActor();

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
    return { error: check.messages.find((m) => m.level === "ERROR")!.message, messages: check.messages };
  }

  const section = await db.section.findFirst({
    where: { id: input.sectionId, schoolId: actor.schoolId },
    select: { id: true, name: true, classId: true, class: { select: { name: true } } },
  });
  if (!section) return { error: "That section is not in this school." };

  const person = await getChatPerson(actor.schoolId, actor.id);
  if (!person) return { error: "You do not have a role at this school." };

  const guard = canSetHomework({
    roles: person.roles,
    classTeacherOfSectionIds: person.classTeacherOfSectionIds,
    teachesSectionIds: person.teachesSectionIds,
    sectionId: section.id,
    isActiveStaff: person.isActiveStaff || person.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r)),
  });
  if (!guard.allowed) return { error: guard.reason! };

  if (input.subjectId) {
    const subject = await db.subject.findFirst({
      where: { id: input.subjectId, schoolId: actor.schoolId },
      select: { id: true, classId: true, name: true },
    });
    if (!subject) return { error: "That subject is not in this school." };
    if (subject.classId && subject.classId !== section.classId) {
      return { error: `${subject.name} is not taught in ${section.class?.name ?? "that class"}.` };
    }
  }

  const publish = input.publish ?? true;

  const made = await db.homework.create({
    data: {
      schoolId: actor.schoolId,
      classId: section.classId,
      sectionId: section.id,
      subjectId: input.subjectId || null,
      staffId: person.staffId,
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

  revalidatePath("/app/homework");
  revalidatePath("/app");
  return { ok: true as const, homeworkId: made.id, messages: check.messages };
}

/** DRAFT → ASSIGNED. Posts it to students the moment it goes live, same as setting it published. */
export async function publishHomework(input: { homeworkId: string }) {
  const actor = await requireActor();

  const hw = await db.homework.findFirst({
    where: { id: input.homeworkId, schoolId: actor.schoolId },
    select: {
      id: true, title: true, status: true, sectionId: true, classId: true,
      section: { select: { id: true, name: true, class: { select: { name: true } } } },
    },
  });
  if (!hw) return { error: "That homework is not in this school." };

  const person = await getChatPerson(actor.schoolId, actor.id);
  if (!person) return { error: "You do not have a role at this school." };
  const guard = canSetHomework({
    roles: person.roles,
    classTeacherOfSectionIds: person.classTeacherOfSectionIds,
    teachesSectionIds: person.teachesSectionIds,
    sectionId: hw.sectionId,
    isActiveStaff: person.isActiveStaff || person.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r)),
  });
  if (!guard.allowed) return { error: guard.reason! };

  const canGo = canPublishHomework({ status: hw.status });
  if (!canGo.allowed) return { error: canGo.reason! };

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

  revalidatePath("/app/homework");
  revalidatePath(`/app/homework/${hw.id}`);
  revalidatePath("/app");
  return { ok: true as const };
}

/** ASSIGNED → CLOSED. Stops new submissions; whatever is already handed in stays. */
export async function closeHomework(input: { homeworkId: string }) {
  const actor = await requireActor();

  const hw = await db.homework.findFirst({
    where: { id: input.homeworkId, schoolId: actor.schoolId },
    select: {
      id: true, title: true, status: true, sectionId: true,
      section: { select: { name: true, class: { select: { name: true } } } },
    },
  });
  if (!hw) return { error: "That homework is not in this school." };

  const person = await getChatPerson(actor.schoolId, actor.id);
  if (!person) return { error: "You do not have a role at this school." };
  const guard = canSetHomework({
    roles: person.roles,
    classTeacherOfSectionIds: person.classTeacherOfSectionIds,
    teachesSectionIds: person.teachesSectionIds,
    sectionId: hw.sectionId,
    isActiveStaff: person.isActiveStaff || person.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r)),
  });
  if (!guard.allowed) return { error: guard.reason! };

  const canGo = canCloseHomework({ status: hw.status });
  if (!canGo.allowed) return { error: canGo.reason! };

  await db.homework.update({ where: { id: hw.id }, data: { status: "CLOSED", closedAt: new Date() } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "homework.close",
    entity: "Homework",
    entityId: hw.id,
    summary: `Closed "${hw.title}" for ${hw.section?.class?.name ?? ""} ${hw.section?.name ?? ""} — no longer taking submissions`.trim(),
  });

  revalidatePath("/app/homework");
  revalidatePath(`/app/homework/${hw.id}`);
  return { ok: true as const };
}

/** A student handing in their own work. One submission, ever — no resubmission, no edits after. */
export async function submitHomework(input: { homeworkId: string; note?: string | null; fileUrl?: string | null }) {
  const actor = await requireActor();

  const hw = await db.homework.findFirst({
    where: { id: input.homeworkId, schoolId: actor.schoolId },
    select: { id: true, title: true, status: true, sectionId: true, classId: true, staffId: true },
  });
  if (!hw) return { error: "That homework is not in this school." };

  const student = await db.student.findFirst({
    where: { schoolId: actor.schoolId, userId: actor.id },
    select: { id: true, name: true, classId: true, sectionId: true },
  });
  if (!student) return { error: "Only a student can hand in homework." };

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
  if (!guard.allowed) return { error: guard.reason! };

  const valid = validateSubmission({ note: input.note ?? null, fileUrl: input.fileUrl ?? null });
  if (!valid.allowed) return { error: valid.reason! };

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

  revalidatePath(`/app/homework/${hw.id}`);
  revalidatePath("/app/homework");
  revalidatePath("/app");
  return { ok: true as const };
}

/**
 * A teacher entering a mark and a note. There is no AI grade to accept or
 * override — this is the only act that scores a submission, and it may be
 * run again if a teacher wants to correct what they typed.
 */
export async function gradeSubmission(input: { submissionId: string; marks?: number | null; feedback?: string | null }) {
  const actor = await requireActor();

  const sub = await db.homeworkSubmission.findFirst({
    where: { id: input.submissionId, homework: { schoolId: actor.schoolId } },
    select: {
      id: true,
      marks: true,
      studentId: true,
      student: { select: { name: true } },
      homework: {
        select: { id: true, title: true, sectionId: true, maxMarks: true },
      },
    },
  });
  if (!sub) return { error: "That submission is not in this school." };

  const person = await getChatPerson(actor.schoolId, actor.id);
  if (!person) return { error: "You do not have a role at this school." };
  const guard = canSetHomework({
    roles: person.roles,
    classTeacherOfSectionIds: person.classTeacherOfSectionIds,
    teachesSectionIds: person.teachesSectionIds,
    sectionId: sub.homework.sectionId,
    isActiveStaff: person.isActiveStaff || person.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r)),
  });
  if (!guard.allowed) return { error: guard.reason! };

  const marks = input.marks == null ? null : Math.trunc(input.marks);
  const valid = validateMarks({ marks, maxMarks: sub.homework.maxMarks });
  if (!valid.allowed) return { error: valid.reason! };

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

  revalidatePath(`/app/homework/${sub.homework.id}`);
  revalidatePath("/app/homework");
  return { ok: true as const };
}

export async function updateHomework(input: {
  homeworkId: string;
  title: string;
  details?: string | null;
  dueIso?: string | null;
}) {
  const actor = await requireActor();

  const hw = await db.homework.findFirst({
    where: { id: input.homeworkId, schoolId: actor.schoolId },
    select: {
      id: true, title: true, details: true, dueOn: true, assignedOn: true, sectionId: true,
      section: { select: { name: true, class: { select: { name: true } } } },
    },
  });
  if (!hw) return { error: "That homework is not in this school." };

  const check = validateHomework({
    title: input.title,
    details: input.details ?? null,
    assignedIso: iso(hw.assignedOn),
    dueIso: input.dueIso ?? null,
    todayIso: iso(schoolToday()),
  });
  if (!check.ok) {
    return { error: check.messages.find((m) => m.level === "ERROR")!.message, messages: check.messages };
  }

  const person = await getChatPerson(actor.schoolId, actor.id);
  if (!person) return { error: "You do not have a role at this school." };
  const guard = canSetHomework({
    roles: person.roles,
    classTeacherOfSectionIds: person.classTeacherOfSectionIds,
    teachesSectionIds: person.teachesSectionIds,
    sectionId: hw.sectionId,
    isActiveStaff: person.isActiveStaff || person.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r)),
  });
  if (!guard.allowed) return { error: guard.reason! };

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
    // Parents have already read the old one, so what changed is the useful record.
    summary: `Changed the homework "${hw.title}" for ${hw.section?.class?.name ?? ""} ${hw.section?.name ?? ""}`.trim(),
    before: { title: hw.title, details: hw.details, dueOn: hw.dueOn ? iso(hw.dueOn) : null },
    after: { title: input.title.trim(), details: input.details ?? null, dueOn: input.dueIso ?? null },
    reversible: true,
  });

  revalidatePath("/app/homework");
  return { ok: true as const, messages: check.messages };
}

export async function deleteHomework(input: { homeworkId: string }) {
  const actor = await requireActor();

  const hw = await db.homework.findFirst({
    where: { id: input.homeworkId, schoolId: actor.schoolId },
    select: {
      id: true, title: true, sectionId: true,
      _count: { select: { submissions: true } },
      section: { select: { name: true, class: { select: { name: true } } } },
    },
  });
  if (!hw) return { error: "That homework is not in this school." };

  const person = await getChatPerson(actor.schoolId, actor.id);
  if (!person) return { error: "You do not have a role at this school." };
  const guard = canSetHomework({
    roles: person.roles,
    classTeacherOfSectionIds: person.classTeacherOfSectionIds,
    teachesSectionIds: person.teachesSectionIds,
    sectionId: hw.sectionId,
    isActiveStaff: person.isActiveStaff || person.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r)),
  });
  if (!guard.allowed) return { error: guard.reason! };

  const canGo = canDeleteHomework({ submissions: hw._count.submissions });
  if (!canGo.allowed) return { error: canGo.reason! };

  await db.homework.delete({ where: { id: hw.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "homework.delete",
    entity: "Homework",
    entityId: hw.id,
    summary: `Removed the homework "${hw.title}" for ${hw.section?.class?.name ?? ""} ${hw.section?.name ?? ""}, which nobody had handed in`.trim(),
  });

  revalidatePath("/app/homework");
  return { ok: true as const };
}
