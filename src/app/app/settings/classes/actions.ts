"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import {
  canBeClassTeacher, canDeleteClass, canDeleteSection, classOrderFor, tidyClassName,
  tidySectionName, validateClassName, validateSectionName,
} from "@/lib/core/setup-core";

/**
 * The shape of the school, editable at last.
 *
 * Every class, section and class teacher in this product came from the seed or was
 * invented by the Excel importer when it met an unfamiliar class name. A school
 * signing up on Monday could not add Class 9 B, could not rename a class it had
 * mistyped, and could not say who the class teacher was — which also meant the
 * parent-to-class-teacher conversation in chat had no way of ever being set up.
 */

export async function createClass(input: { name: string }) {
  const actor = await requireRole(...OFFICE);

  const existing = await db.class.findMany({ where: { schoolId: actor.schoolId }, select: { name: true } });
  const check = validateClassName(input.name, existing.map((c) => c.name));
  if (!check.allowed) return { error: check.reason! };

  const name = tidyClassName(input.name);
  const cls = await db.class.create({
    data: { schoolId: actor.schoolId, name, sequenceOrder: classOrderFor(name) },
    select: { id: true, name: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.class.create",
    entity: "Class",
    entityId: cls.id,
    summary: `Added ${cls.name}`,
  });

  revalidatePath("/app/settings/classes");
  return { ok: true as const, classId: cls.id, name: cls.name };
}

export async function renameClass(input: { classId: string; name: string }) {
  const actor = await requireRole(...OFFICE);

  const before = await db.class.findFirst({
    where: { id: input.classId, schoolId: actor.schoolId },
    select: { id: true, name: true },
  });
  if (!before) return { error: "That class is not in this school." };

  const others = await db.class.findMany({
    where: { schoolId: actor.schoolId, id: { not: before.id } },
    select: { name: true },
  });
  const check = validateClassName(input.name, others.map((c) => c.name));
  if (!check.allowed) return { error: check.reason! };

  const name = tidyClassName(input.name);
  await db.class.update({
    where: { id: before.id },
    data: { name, sequenceOrder: classOrderFor(name) },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.class.rename",
    entity: "Class",
    entityId: before.id,
    summary: `Renamed ${before.name} to ${name}`,
    before: { name: before.name },
    after: { name },
    reversible: true,
  });

  revalidatePath("/app/settings/classes");
  revalidatePath("/app/students");
  return { ok: true as const };
}

export async function createSection(input: { classId: string; name: string }) {
  const actor = await requireRole(...OFFICE);

  const cls = await db.class.findFirst({
    where: { id: input.classId, schoolId: actor.schoolId },
    select: { id: true, name: true, sections: { select: { name: true } } },
  });
  if (!cls) return { error: "That class is not in this school." };

  const check = validateSectionName(input.name, cls.sections.map((s) => s.name));
  if (!check.allowed) return { error: check.reason! };

  const name = tidySectionName(input.name);
  const section = await db.section.create({
    data: { schoolId: actor.schoolId, classId: cls.id, name },
    select: { id: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.section.create",
    entity: "Section",
    entityId: section.id,
    summary: `Added section ${name} to ${cls.name}`,
  });

  revalidatePath("/app/settings/classes");
  return { ok: true as const };
}

/**
 * Who the class teacher is — the single field the whole parent-to-teacher
 * conversation hangs off, which is why it refuses somebody who has left.
 */
export async function setClassTeacher(input: { sectionId: string; userId: string | null }) {
  const actor = await requireRole(...OFFICE);

  const section = await db.section.findFirst({
    where: { id: input.sectionId, schoolId: actor.schoolId },
    select: {
      id: true, name: true, classTeacherId: true,
      class: { select: { name: true } },
      classTeacher: { select: { name: true } },
    },
  });
  if (!section) return { error: "That section is not in this school." };

  let teacherName: string | null = null;

  if (input.userId) {
    const [roles, staff, user] = await Promise.all([
      db.schoolRole.findMany({ where: { userId: input.userId, schoolId: actor.schoolId }, select: { role: true } }),
      db.staff.findFirst({ where: { userId: input.userId, schoolId: actor.schoolId }, select: { isActive: true } }),
      db.user.findUnique({ where: { id: input.userId }, select: { name: true } }),
    ]);
    if (roles.length === 0 || !user) return { error: "That person is not part of this school." };

    const check = canBeClassTeacher({
      isActiveStaff: Boolean(staff?.isActive),
      roles: roles.map((r) => r.role),
    });
    if (!check.allowed) return { error: check.reason! };

    teacherName = user.name;
  }

  await db.section.update({
    where: { id: section.id },
    data: { classTeacherId: input.userId },
  });

  const where = `${section.class.name} ${section.name}`;
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.section.classTeacher",
    entity: "Section",
    entityId: section.id,
    summary: teacherName
      ? `${teacherName} is now class teacher of ${where}`
      : `Removed the class teacher from ${where}`,
    before: { classTeacher: section.classTeacher?.name ?? null },
    after: { classTeacher: teacherName },
    reversible: true,
  });

  revalidatePath("/app/settings/classes");
  revalidatePath("/app/chat/new");
  revalidatePath("/app");
  return { ok: true as const };
}

export async function deleteSection(input: { sectionId: string }) {
  const actor = await requireRole(...OFFICE);

  const section = await db.section.findFirst({
    where: { id: input.sectionId, schoolId: actor.schoolId },
    select: {
      id: true, name: true, class: { select: { name: true } },
      _count: { select: { students: true, attendance: true, timetable: true, homework: true } },
    },
  });
  if (!section) return { error: "That section is not in this school." };

  const check = canDeleteSection({
    students: section._count.students,
    attendance: section._count.attendance,
    timetable: section._count.timetable,
    homework: section._count.homework,
  });
  if (!check.allowed) return { error: check.reason! };

  await db.section.delete({ where: { id: section.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.section.delete",
    entity: "Section",
    entityId: section.id,
    summary: `Removed the empty section ${section.class.name} ${section.name}`,
  });

  revalidatePath("/app/settings/classes");
  return { ok: true as const };
}

export async function deleteClass(input: { classId: string }) {
  const actor = await requireRole(...OFFICE);

  const cls = await db.class.findFirst({
    where: { id: input.classId, schoolId: actor.schoolId },
    select: { id: true, name: true, _count: { select: { students: true, sections: true, subjects: true } } },
  });
  if (!cls) return { error: "That class is not in this school." };

  const check = canDeleteClass({
    students: cls._count.students,
    sections: cls._count.sections,
    subjects: cls._count.subjects,
  });
  if (!check.allowed) return { error: check.reason! };

  await db.class.delete({ where: { id: cls.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.class.delete",
    entity: "Class",
    entityId: cls.id,
    summary: `Removed the empty class ${cls.name}`,
  });

  revalidatePath("/app/settings/classes");
  return { ok: true as const };
}
