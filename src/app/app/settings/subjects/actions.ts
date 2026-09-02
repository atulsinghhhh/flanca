"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { canDeleteSubject, tidySubjectName, validateSubjectName } from "@/lib/core/setup-core";

/**
 * What each class is taught, and who teaches it.
 *
 * Subjects were seed-only until now, which meant a school could not add Sanskrit,
 * could not mark Art as co-scholastic so it grades rather than marks, and could not
 * record which teacher takes which paper — and that last one is what the teacher's
 * own "marks still to enter" list is built from, so without it a teacher sees
 * either everything or nothing.
 */

export async function createSubject(input: {
  classId: string;
  name: string;
  code?: string | null;
  isElective?: boolean;
  isCoScholastic?: boolean;
}) {
  const actor = await requireRole(...OFFICE);

  const cls = await db.class.findFirst({
    where: { id: input.classId, schoolId: actor.schoolId },
    select: { id: true, name: true, subjects: { select: { name: true } } },
  });
  if (!cls) return { error: "That class is not in this school." };

  const check = validateSubjectName(input.name, cls.subjects.map((s) => s.name));
  if (!check.allowed) return { error: check.reason! };

  const name = tidySubjectName(input.name);
  const subject = await db.subject.create({
    data: {
      schoolId: actor.schoolId,
      classId: cls.id,
      name,
      code: input.code?.trim() || null,
      isElective: Boolean(input.isElective),
      isCoScholastic: Boolean(input.isCoScholastic),
    },
    select: { id: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.subject.create",
    entity: "Subject",
    entityId: subject.id,
    summary: `Added ${name} to ${cls.name}${input.isCoScholastic ? " as a co-scholastic subject" : ""}`,
  });

  revalidatePath("/app/settings/subjects");
  return { ok: true as const };
}

export async function updateSubject(input: {
  subjectId: string;
  name: string;
  code?: string | null;
  isElective?: boolean;
  isCoScholastic?: boolean;
}) {
  const actor = await requireRole(...OFFICE);

  const before = await db.subject.findFirst({
    where: { id: input.subjectId, schoolId: actor.schoolId },
    select: {
      id: true, name: true, code: true, isElective: true, isCoScholastic: true, classId: true,
      class: { select: { name: true } },
    },
  });
  if (!before) return { error: "That subject is not in this school." };

  const siblings = await db.subject.findMany({
    where: { schoolId: actor.schoolId, classId: before.classId, id: { not: before.id } },
    select: { name: true },
  });
  const check = validateSubjectName(input.name, siblings.map((s) => s.name));
  if (!check.allowed) return { error: check.reason! };

  const name = tidySubjectName(input.name);
  await db.subject.update({
    where: { id: before.id },
    data: {
      name,
      code: input.code?.trim() || null,
      isElective: Boolean(input.isElective),
      isCoScholastic: Boolean(input.isCoScholastic),
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.subject.update",
    entity: "Subject",
    entityId: before.id,
    summary: `Changed ${before.name} in ${before.class?.name ?? "the school"}${name !== before.name ? ` to ${name}` : ""}`,
    before: { name: before.name, code: before.code, isElective: before.isElective, isCoScholastic: before.isCoScholastic },
    after: { name, code: input.code ?? null, isElective: Boolean(input.isElective), isCoScholastic: Boolean(input.isCoScholastic) },
    reversible: true,
  });

  revalidatePath("/app/settings/subjects");
  return { ok: true as const };
}

export async function deleteSubject(input: { subjectId: string }) {
  const actor = await requireRole(...OFFICE);

  const subject = await db.subject.findFirst({
    where: { id: input.subjectId, schoolId: actor.schoolId },
    select: {
      id: true, name: true, class: { select: { name: true } },
      _count: { select: { exams: true, timetable: true, homework: true, lessonPlans: true } },
    },
  });
  if (!subject) return { error: "That subject is not in this school." };

  const check = canDeleteSubject({
    exams: subject._count.exams,
    timetable: subject._count.timetable,
    homework: subject._count.homework,
    lessonPlans: subject._count.lessonPlans,
  });
  if (!check.allowed) return { error: check.reason! };

  await db.subject.delete({ where: { id: subject.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.subject.delete",
    entity: "Subject",
    entityId: subject.id,
    summary: `Removed ${subject.name} from ${subject.class?.name ?? "the school"}`,
  });

  revalidatePath("/app/settings/subjects");
  return { ok: true as const };
}

/**
 * Who teaches this subject. Replaces the whole set in one transaction rather than
 * adding and removing one at a time, so a half-applied change cannot leave a
 * teacher looking at marks that are not theirs to enter.
 */
export async function setSubjectTeachers(input: { subjectId: string; staffIds: string[] }) {
  const actor = await requireRole(...OFFICE);

  const subject = await db.subject.findFirst({
    where: { id: input.subjectId, schoolId: actor.schoolId },
    select: { id: true, name: true, class: { select: { name: true } } },
  });
  if (!subject) return { error: "That subject is not in this school." };

  // StaffSubject carries no schoolId of its own, so the staff have to be checked
  // against this school explicitly — otherwise the id list is trusted as given.
  const staff = await db.staff.findMany({
    where: { id: { in: input.staffIds }, schoolId: actor.schoolId, isActive: true },
    select: { id: true, user: { select: { name: true } } },
  });
  if (staff.length !== input.staffIds.length) {
    return { error: "One of those teachers is not active staff at this school." };
  }

  await db.$transaction(async (tx) => {
    await tx.staffSubject.deleteMany({ where: { subjectId: subject.id } });
    if (staff.length > 0) {
      await tx.staffSubject.createMany({
        data: staff.map((s) => ({ staffId: s.id, subjectId: subject.id })),
        skipDuplicates: true,
      });
    }
  });

  const where = `${subject.class?.name ?? "the school"} ${subject.name}`;
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.subject.teachers",
    entity: "Subject",
    entityId: subject.id,
    summary:
      staff.length === 0
        ? `Nobody is now assigned to teach ${where}`
        : `${staff.map((s) => s.user.name).join(", ")} now ${staff.length === 1 ? "teaches" : "teach"} ${where}`,
  });

  revalidatePath("/app/settings/subjects");
  revalidatePath("/app");
  return { ok: true as const };
}
