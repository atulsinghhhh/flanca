"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { firstPassword, loginDomainFor, planLogins, type LoginCandidate } from "@/lib/core/login-core";

/**
 * Giving a class their own logins — the last thing standing between a child and
 * the tutor without a parent's phone in the room.
 *
 * A provisioned tutor account has no usable password on purpose: the child enters
 * through the school. Which means a child with no Flanca login has no way in at
 * all, and Flanca deliberately issues logins to a slice of the roll. Correct
 * before the tutor existed; a hole after it.
 *
 * The two rules that matter are both about the second press of the button.
 * Nothing is ever re-issued to a child who already has a login, and the codes
 * exist in exactly one place — the response to the request that created them.
 * They are hashed on the way into the database and never logged, so a slip that
 * is lost is a password reset, not a lookup.
 */

/** Cryptographic, not Math.random. The core takes the source so this can be it. */
const random = () => crypto.randomInt(0, 1_000_000) / 1_000_000;

async function candidatesFor(schoolId: string, classId: string | null) {
  const students = await db.student.findMany({
    where: { schoolId, status: "ACTIVE", ...(classId ? { classId } : {}) },
    select: { id: true, name: true, admissionNumber: true, userId: true, class: { select: { name: true } }, section: { select: { name: true } } },
    orderBy: [{ class: { sequenceOrder: "asc" } }, { admissionNumber: "asc" }],
  });

  const school = await db.school.findUniqueOrThrow({
    where: { id: schoolId },
    select: { name: true, slug: true, email: true },
  });

  return { students, school, domain: loginDomainFor(school) };
}

export async function previewLogins(classId: string | null) {
  const actor = await requireRole(...OFFICE);
  const { students, domain } = await candidatesFor(actor.schoolId, classId);

  const candidates: LoginCandidate[] = students.map((s) => ({
    admissionNumber: s.admissionNumber,
    name: s.name,
    hasLogin: s.userId !== null,
  }));

  // Every address already in use, so a collision is caught before it becomes a
  // failed insert halfway through a class.
  const taken = new Set(
    (await db.user.findMany({ select: { email: true } })).map((u) => u.email.toLowerCase()),
  );

  const plan = planLogins(candidates, domain.domain, taken);
  return {
    plan,
    domain: domain.domain,
    deliverable: domain.deliverable,
    label: classId ? (students[0]?.class?.name ?? "This class") : "The whole school",
  };
}

export interface Slip {
  admissionNumber: string;
  name: string;
  className: string;
  email: string;
  /** Shown once, here, and nowhere else ever again. */
  code: string;
}

export async function issueLogins(classId: string | null): Promise<{ error: string } | { slips: Slip[]; skipped: number; label: string }> {
  const actor = await requireRole(...OFFICE);
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
    return { error: "Every active child in that scope already has a login." };
  }

  const slips: Slip[] = [];

  /*
   * One transaction for the whole class. A half-issued class is the worst
   * outcome: the office has printed slips for forty children and twenty of them
   * do not work, with no way to tell which without trying each one.
   */
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

  /*
   * Audited with the count and the scope, and deliberately WITHOUT the codes.
   * The audit trail is the answer to "who gave this child an account"; it is not
   * a place to keep a working credential for four hundred children.
   */
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "student.logins.issue",
    entity: "Student",
    entityId: classId,
    summary: `Issued ${slips.length} student login${slips.length === 1 ? "" : "s"} for ${classId ? (students[0]?.class?.name ?? "a class") : "the whole school"}`,
    after: { issued: slips.length, skipped: plan.skipped.length, domain: domain.domain },
  });

  revalidatePath("/app/students/logins");
  return {
    slips,
    skipped: plan.skipped.length,
    label: classId ? (students[0]?.class?.name ?? "This class") : "The whole school",
  };
}

/**
 * Reset one child's login, deliberately and one at a time.
 *
 * Separate from issuing on purpose: "give the class logins" must never be able to
 * change the password of a child who has been using theirs for a month, so the
 * only way to replace one is to say which child.
 */
export async function resetLogin(studentId: string): Promise<{ error: string } | { slip: Slip }> {
  const actor = await requireRole(...OFFICE);

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
  if (!student?.userId || !student.user) return { error: "That child has no login to reset." };

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

  revalidatePath("/app/students/logins");
  return {
    slip: {
      admissionNumber: student.admissionNumber,
      name: student.name,
      className: `${student.class?.name ?? "—"}${student.section ? ` ${student.section.name}` : ""}`,
      email: student.user.email,
      code,
    },
  };
}
