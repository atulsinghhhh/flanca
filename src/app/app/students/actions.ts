"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, StudentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { nextNumber } from "@/lib/sequence";
import {
  admissionPrefixFrom, digitsOf, highestAdmissionSeq, validateStudentDetails,
} from "@/lib/core/student-core";

/**
 * Adding a child at the front desk, and correcting one afterwards.
 *
 * Until this existed, every student came from the seed or from an Excel import —
 * so a school could not admit a walk-in, and could not fix a misspelt name without
 * re-importing the whole register. The roster's own "Add student" button pointed at
 * a page that was never built.
 */

export type StudentInput = {
  name: string;
  classId: string;
  sectionId?: string | null;
  admissionNumber?: string | null;
  rollNumber?: number | null;
  dobIso?: string | null;
  gender?: string | null;
  fatherName?: string | null;
  motherName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  address?: string | null;
  category?: string | null;
  bloodGroup?: string | null;
  admissionDateIso?: string | null;
};

/**
 * The next admission number for this school.
 *
 * Kept here rather than in the caller because two callers need it — the front desk
 * and an admission from the public application queue — and they must not invent
 * two numbering schemes. It runs inside the caller's transaction so a failed
 * create rolls the number back, and it BOOTSTRAPS from the roll: a school that has
 * been numbering NPS/1001…NPS/1848 for years keeps its habit, and the sequence
 * starts after the highest number actually in use rather than on top of it.
 */
export async function allocateAdmissionNumber(
  tx: Prisma.TransactionClient,
  schoolId: string,
): Promise<string> {
  const existing = await tx.numberSequence.findUnique({
    where: { schoolId_kind: { schoolId, kind: "ADMISSION" } },
    select: { id: true },
  });

  if (!existing) {
    const [roll, school] = await Promise.all([
      tx.student.findMany({ where: { schoolId }, select: { admissionNumber: true } }),
      tx.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    ]);
    const numbers = roll.map((r) => r.admissionNumber);
    await tx.numberSequence.create({
      data: {
        schoolId,
        kind: "ADMISSION",
        prefix: admissionPrefixFrom({ sample: numbers[0] ?? null, schoolName: school?.name ?? null }),
        next: highestAdmissionSeq(numbers) + 1,
        width: 4,
      },
    });
  }

  return nextNumber(tx, schoolId, "ADMISSION", "ADM/");
}

function fieldsFrom(input: StudentInput) {
  const phone = digitsOf(input.guardianPhone);
  return {
    name: input.name.trim(),
    classId: input.classId,
    sectionId: input.sectionId || null,
    rollNumber: input.rollNumber ?? null,
    dob: input.dobIso ? new Date(`${input.dobIso}T00:00:00Z`) : null,
    gender: (input.gender || null) as never,
    fatherName: input.fatherName?.trim() || null,
    motherName: input.motherName?.trim() || null,
    guardianPhone: phone === "" ? null : phone,
    guardianEmail: input.guardianEmail?.trim() || null,
    address: input.address?.trim() || null,
    category: input.category?.trim() || null,
    bloodGroup: input.bloodGroup?.trim() || null,
  };
}

type Placement = { error: string; cls?: undefined } | { error?: undefined; cls: { id: string; name: string } };

/** Check the class and section actually belong to this school, and to each other. */
async function checkPlacement(schoolId: string, classId: string, sectionId?: string | null): Promise<Placement> {
  const cls = await db.class.findFirst({ where: { id: classId, schoolId }, select: { id: true, name: true } });
  if (!cls) return { error: "That class is not in this school." };

  if (sectionId) {
    const section = await db.section.findFirst({
      where: { id: sectionId, schoolId, classId },
      select: { id: true },
    });
    if (!section) return { error: "That section does not belong to the class you chose." };
  }
  return { cls };
}

export async function createStudent(input: StudentInput) {
  const actor = await requireRole(...OFFICE);

  const check = validateStudentDetails({
    name: input.name,
    classId: input.classId,
    rollNumber: input.rollNumber ?? null,
    dobIso: input.dobIso ?? null,
    gender: input.gender ?? null,
    guardianPhone: input.guardianPhone ?? null,
    guardianEmail: input.guardianEmail ?? null,
    admissionNumber: input.admissionNumber ?? null,
    sectionId: input.sectionId ?? null,
  });
  if (!check.ok) {
    return { error: check.messages.find((m) => m.level === "ERROR")!.message, messages: check.messages };
  }

  const placement = await checkPlacement(actor.schoolId, input.classId, input.sectionId);
  if (placement.error) return { error: placement.error, messages: check.messages };

  const typed = input.admissionNumber?.trim();
  if (typed) {
    const clash = await db.student.findFirst({
      where: { schoolId: actor.schoolId, admissionNumber: typed },
      select: { name: true },
    });
    if (clash) return { error: `${typed} already belongs to ${clash.name}.`, messages: check.messages };
  }

  const admissionDate = input.admissionDateIso ? new Date(`${input.admissionDateIso}T00:00:00Z`) : new Date();

  try {
    const student = await db.$transaction(async (tx) => {
      const admissionNumber = typed || (await allocateAdmissionNumber(tx, actor.schoolId));
      return tx.student.create({
        data: {
          schoolId: actor.schoolId,
          admissionNumber,
          status: "ACTIVE",
          admissionDate,
          ...fieldsFrom(input),
        },
        select: { id: true, name: true, admissionNumber: true },
      });
    });

    await audit({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: "student.create",
      entity: "Student",
      entityId: student.id,
      summary: `Admitted ${student.name} into ${placement.cls!.name} as ${student.admissionNumber}`,
      after: { admissionNumber: student.admissionNumber, name: student.name },
    });

    revalidatePath("/app/students");
    revalidatePath("/app");
    return { ok: true as const, studentId: student.id, admissionNumber: student.admissionNumber, messages: check.messages };
  } catch {
    // The unique index is the last word on admission numbers, and two clerks
    // admitting at once is a real Monday morning.
    return { error: "That admission number was taken while you were typing. Try again.", messages: check.messages };
  }
}

export async function updateStudent(input: StudentInput & { studentId: string }) {
  const actor = await requireRole(...OFFICE);

  const before = await db.student.findFirst({
    where: { id: input.studentId, schoolId: actor.schoolId },
    select: {
      id: true, name: true, admissionNumber: true, rollNumber: true, classId: true, sectionId: true,
      guardianPhone: true, fatherName: true,
    },
  });
  if (!before) return { error: "That student is not on this school's roll.", messages: [] };

  const check = validateStudentDetails({
    name: input.name,
    classId: input.classId,
    rollNumber: input.rollNumber ?? null,
    dobIso: input.dobIso ?? null,
    gender: input.gender ?? null,
    guardianPhone: input.guardianPhone ?? null,
    guardianEmail: input.guardianEmail ?? null,
  });
  if (!check.ok) {
    return { error: check.messages.find((m) => m.level === "ERROR")!.message, messages: check.messages };
  }

  const placement = await checkPlacement(actor.schoolId, input.classId, input.sectionId);
  if (placement.error) return { error: placement.error, messages: check.messages };

  // The admission number is deliberately NOT editable here: it is printed on
  // receipts, report cards and certificates already issued, and changing it would
  // orphan every one of them. A wrong number is a transfer-out and a re-admission.
  await db.student.update({ where: { id: before.id }, data: fieldsFrom(input) });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "student.update",
    entity: "Student",
    entityId: before.id,
    summary: `Corrected ${before.name}'s record (${before.admissionNumber})`,
    before,
    after: fieldsFrom(input),
    reversible: true,
  });

  revalidatePath(`/app/students/${before.id}`);
  revalidatePath("/app/students");
  return { ok: true as const, studentId: before.id, messages: check.messages };
}

const SETTABLE_STATUSES = ["ACTIVE", "ALUMNI", "DROPPED"] as const;
type SettableStatus = (typeof SETTABLE_STATUSES)[number];

/**
 * Move a child off (or back onto) the active roll.
 *
 * TRANSFERRED is deliberately not settable here — that status only ever
 * follows a TC certificate (see certificates/actions.ts), so a record already
 * marked TRANSFERRED cannot be relabelled from this button. ALUMNI and
 * DROPPED have no certificate of their own, so without this the filter tabs
 * on the roster page had no way to ever be reached.
 */
export async function setStudentStatus(
  studentId: string,
  status: SettableStatus,
): Promise<{ error: string } | { ok: true; studentId: string }> {
  const actor = await requireRole(...OFFICE);

  if (!SETTABLE_STATUSES.includes(status)) {
    return { error: "That status cannot be set here." };
  }

  const before = await db.student.findFirst({
    where: { id: studentId, schoolId: actor.schoolId },
    select: { id: true, name: true, admissionNumber: true, status: true },
  });
  if (!before) return { error: "That student is not on this school's roll." };
  if (before.status === "TRANSFERRED") {
    return { error: "This child was transferred out with a TC. Cancel that certificate to undo it." };
  }
  if (before.status === status) return { ok: true as const, studentId: before.id };

  await db.student.update({ where: { id: before.id }, data: { status: status as StudentStatus } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "student.status.set",
    entity: "Student",
    entityId: before.id,
    summary: `Marked ${before.name} (${before.admissionNumber}) as ${status}`,
    before: { status: before.status },
    after: { status },
    reversible: true,
  });

  revalidatePath(`/app/students/${before.id}`);
  revalidatePath("/app/students");
  return { ok: true as const, studentId: before.id };
}
