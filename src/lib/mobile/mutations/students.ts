import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import { allocateAdmissionNumber } from "@/app/app/students/actions";
import { digitsOf, validateStudentDetails, type FieldMessage } from "@/lib/core/student-core";
import { firstPassword, loginDomainFor, planLogins, type LoginCandidate } from "@/lib/core/login-core";

/**
 * The mobile-API twin of src/app/app/students/actions.ts and
 * src/app/app/students/logins/actions.ts — same validation (student-core is
 * reused, not reimplemented), same admission-number allocation
 * (allocateAdmissionNumber is imported straight from the web action rather
 * than re-derived, exactly as src/lib/mobile/mutations/admissions.ts already
 * does), same one-time-visible login codes.
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

type Failure = { ok: false; status: number; code: string; message: string; messages?: FieldMessage[] };
const invalid = (message: string, messages?: FieldMessage[]): Failure => ({
  ok: false,
  status: 422,
  code: "invalid_input",
  message,
  messages,
});
const notFound = (message: string): Failure => ({ ok: false, status: 404, code: "not_found", message });
const conflict = (message: string): Failure => ({ ok: false, status: 409, code: "conflict", message });

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

export type CreateStudentResult =
  | Failure
  | { ok: true; studentId: string; admissionNumber: string; messages: FieldMessage[] };

/** Mirrors src/app/app/students/actions.ts::createStudent. */
export async function createStudentForActor(actor: Actor, input: StudentInput): Promise<CreateStudentResult> {
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
    return invalid(check.messages.find((m) => m.level === "ERROR")!.message, check.messages);
  }

  const placement = await checkPlacement(actor.schoolId, input.classId, input.sectionId);
  if (placement.error) return invalid(placement.error, check.messages);

  const typed = input.admissionNumber?.trim();
  if (typed) {
    const clash = await db.student.findFirst({
      where: { schoolId: actor.schoolId, admissionNumber: typed },
      select: { name: true },
    });
    if (clash) return conflict(`${typed} already belongs to ${clash.name}.`);
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

    return { ok: true, studentId: student.id, admissionNumber: student.admissionNumber, messages: check.messages };
  } catch {
    // The unique index is the last word on admission numbers, and two clerks
    // admitting at once is a real Monday morning.
    return conflict("That admission number was taken while you were typing. Try again.");
  }
}

export type UpdateStudentResult = Failure | { ok: true; studentId: string; messages: FieldMessage[] };

/** Mirrors src/app/app/students/actions.ts::updateStudent. */
export async function updateStudentForActor(
  actor: Actor,
  input: StudentInput & { studentId: string },
): Promise<UpdateStudentResult> {
  const before = await db.student.findFirst({
    where: { id: input.studentId, schoolId: actor.schoolId },
    select: {
      id: true, name: true, admissionNumber: true, rollNumber: true, classId: true, sectionId: true,
      guardianPhone: true, fatherName: true,
    },
  });
  if (!before) return notFound("That student is not on this school's roll.");

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
    return invalid(check.messages.find((m) => m.level === "ERROR")!.message, check.messages);
  }

  const placement = await checkPlacement(actor.schoolId, input.classId, input.sectionId);
  if (placement.error) return invalid(placement.error, check.messages);

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

  return { ok: true, studentId: before.id, messages: check.messages };
}

/** Cryptographic, not Math.random. Identical to src/app/app/students/logins/actions.ts::random. */
const random = () => crypto.randomInt(0, 1_000_000) / 1_000_000;

async function candidatesFor(schoolId: string, classId: string | null) {
  const students = await db.student.findMany({
    where: { schoolId, status: "ACTIVE", ...(classId ? { classId } : {}) },
    select: {
      id: true,
      name: true,
      admissionNumber: true,
      userId: true,
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
    orderBy: [{ class: { sequenceOrder: "asc" } }, { admissionNumber: "asc" }],
  });

  const school = await db.school.findUniqueOrThrow({
    where: { id: schoolId },
    select: { name: true, slug: true, email: true },
  });

  return { students, school, domain: loginDomainFor(school) };
}

export interface Slip {
  admissionNumber: string;
  name: string;
  className: string;
  email: string;
  /** Shown once, here, and nowhere else ever again. */
  code: string;
}

/** Mirrors src/app/app/students/logins/actions.ts::previewLogins. */
export async function previewLoginsForActor(actor: Actor, classId: string | null) {
  const { students, domain } = await candidatesFor(actor.schoolId, classId);

  const candidates: LoginCandidate[] = students.map((s) => ({
    admissionNumber: s.admissionNumber,
    name: s.name,
    hasLogin: s.userId !== null,
  }));

  const taken = new Set(
    (await db.user.findMany({ select: { email: true } })).map((u) => u.email.toLowerCase()),
  );

  const plan = planLogins(candidates, domain.domain, taken);
  return {
    ok: true as const,
    plan,
    domain: domain.domain,
    deliverable: domain.deliverable,
    label: classId ? (students[0]?.class?.name ?? "This class") : "The whole school",
  };
}

export type IssueLoginsResult = Failure | { ok: true; slips: Slip[]; skipped: number; label: string };

/** Mirrors src/app/app/students/logins/actions.ts::issueLogins. */
export async function issueLoginsForActor(actor: Actor, classId: string | null): Promise<IssueLoginsResult> {
  const { students, domain } = await candidatesFor(actor.schoolId, classId);

  const byRef = new Map(students.map((s) => [s.admissionNumber, s]));
  const taken = new Set(
    (await db.user.findMany({ select: { email: true } })).map((u) => u.email.toLowerCase()),
  );

  const plan = planLogins(
    students.map((s) => ({ admissionNumber: s.admissionNumber, name: s.name, hasLogin: s.userId !== null })),
    domain.domain,
    taken,
  );

  if (plan.create.length === 0) {
    return invalid("Every active child in that scope already has a login.");
  }

  const slips: Slip[] = [];

  await db.$transaction(
    async (tx) => {
      for (const row of plan.create) {
        const student = byRef.get(row.admissionNumber);
        if (!student) continue;

        const code = firstPassword(random);
        const user = await tx.user.create({
          data: {
            name: row.name,
            email: row.email,
            passwordHash: await bcrypt.hash(code, 10),
            mustChangePassword: true,
            roles: { create: { schoolId: actor.schoolId, role: "STUDENT" } },
          },
          select: { id: true },
        });
        await tx.student.update({ where: { id: student.id }, data: { userId: user.id } });

        slips.push({
          admissionNumber: row.admissionNumber,
          name: row.name,
          className: `${student.class?.name ?? "—"}${student.section ? ` ${student.section.name}` : ""}`,
          email: row.email,
          code,
        });
      }
    },
    { timeout: 120_000 },
  );

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "student.logins.issue",
    entity: "Student",
    entityId: classId,
    summary: `Issued ${slips.length} student login${slips.length === 1 ? "" : "s"} for ${classId ? (students[0]?.class?.name ?? "a class") : "the whole school"}`,
    after: { issued: slips.length, skipped: plan.skipped.length, domain: domain.domain },
  });

  return {
    ok: true,
    slips,
    skipped: plan.skipped.length,
    label: classId ? (students[0]?.class?.name ?? "This class") : "The whole school",
  };
}

export type ResetLoginResult = Failure | { ok: true; slip: Slip };

/** Mirrors src/app/app/students/logins/actions.ts::resetLogin. */
export async function resetLoginForActor(actor: Actor, studentId: string): Promise<ResetLoginResult> {
  const student = await db.student.findFirst({
    where: { id: studentId, schoolId: actor.schoolId },
    select: {
      name: true,
      admissionNumber: true,
      userId: true,
      class: { select: { name: true } },
      section: { select: { name: true } },
      user: { select: { email: true } },
    },
  });
  if (!student?.userId || !student.user) return invalid("That child has no login to reset.");

  const code = firstPassword(random);
  await db.user.update({
    where: { id: student.userId },
    data: { passwordHash: await bcrypt.hash(code, 10), mustChangePassword: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "student.login.reset",
    entity: "Student",
    entityId: studentId,
    summary: `Reset the login for ${student.name} (${student.admissionNumber})`,
  });

  return {
    ok: true,
    slip: {
      admissionNumber: student.admissionNumber,
      name: student.name,
      className: `${student.class?.name ?? "—"}${student.section ? ` ${student.section.name}` : ""}`,
      email: student.user.email,
      code,
    },
  };
}
