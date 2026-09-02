"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { APAAR_STATES, nameMismatch } from "@/lib/core/apaar-core";

/** Record what the UDISE+ portal told us about one student. */
export async function updateApaar(input: {
  studentId: string;
  apaarId?: string;
  penNumber?: string;
  aadhaarName?: string;
  status?: string;
  note?: string;
}) {
  const actor = await requireRole(...OFFICE);

  const student = await db.student.findFirst({
    where: { id: input.studentId, schoolId: actor.schoolId },
    select: { id: true, name: true, apaarId: true, apaarStatus: true, aadhaarName: true },
  });
  if (!student) return { error: "That student is not on this school's roll." };

  const apaarId = input.apaarId?.trim();
  // APAAR IDs are 12 digits. Rejecting a malformed one here saves a wasted
  // portal submission and a certification failure later.
  if (apaarId && !/^\d{12}$/.test(apaarId)) {
    return { error: "An APAAR ID is 12 digits. Check what the portal issued." };
  }
  if (input.status && !APAAR_STATES.includes(input.status as never)) {
    return { error: "That is not a valid APAAR status." };
  }

  const updated = await db.student.update({
    where: { id: student.id },
    data: {
      ...(apaarId !== undefined ? { apaarId: apaarId || null } : {}),
      ...(input.penNumber !== undefined ? { penNumber: input.penNumber.trim() || null } : {}),
      ...(input.aadhaarName !== undefined ? { aadhaarName: input.aadhaarName.trim() || null } : {}),
      ...(input.status ? { apaarStatus: input.status } : apaarId ? { apaarStatus: "ISSUED" } : {}),
      ...(input.note !== undefined ? { apaarNote: input.note.trim() || null } : {}),
      apaarUpdatedAt: new Date(),
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "apaar.update",
    entity: "Student",
    entityId: student.id,
    summary: apaarId
      ? `APAAR ID recorded for ${student.name}`
      : `APAAR status for ${student.name} set to ${input.status ?? "updated"}`,
    before: { apaarId: student.apaarId, apaarStatus: student.apaarStatus },
    after: { apaarId: updated.apaarId, apaarStatus: updated.apaarStatus },
  });

  revalidatePath("/app/apaar");
  revalidatePath(`/app/students/${student.id}`);
  return { ok: true };
}

/**
 * Paste the block of IDs UDISE+ returns and have them matched by admission
 * number. Typing 148 twelve-digit numbers by hand is how mistakes happen.
 */
export async function bulkRecordApaarIds(pasted: string) {
  const actor = await requireRole(...OFFICE);

  const lines = pasted
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { error: "Paste at least one line." };

  const parsed = lines.map((line, i) => {
    const parts = line.split(/[,\t;|]+/).map((p) => p.trim());
    return { line: i + 1, admissionNumber: parts[0] ?? "", apaarId: parts[1] ?? "", raw: line };
  });

  const admissionNumbers = parsed.map((p) => p.admissionNumber).filter(Boolean);
  const students = await db.student.findMany({
    where: { schoolId: actor.schoolId, admissionNumber: { in: admissionNumbers } },
    select: { id: true, admissionNumber: true, name: true },
  });
  const byAdm = new Map(students.map((s) => [s.admissionNumber, s]));

  const applied: string[] = [];
  const problems: Array<{ line: number; raw: string; reason: string }> = [];

  for (const row of parsed) {
    const student = byAdm.get(row.admissionNumber);
    if (!student) {
      problems.push({ line: row.line, raw: row.raw, reason: "No student with that admission number" });
      continue;
    }
    if (!/^\d{12}$/.test(row.apaarId)) {
      problems.push({ line: row.line, raw: row.raw, reason: "APAAR ID is not 12 digits" });
      continue;
    }

    await db.student.update({
      where: { id: student.id },
      data: { apaarId: row.apaarId, apaarStatus: "ISSUED", apaarNote: null, apaarUpdatedAt: new Date() },
    });
    applied.push(student.name);
  }

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "apaar.bulk",
    entity: "School",
    entityId: actor.schoolId,
    summary: `Recorded ${applied.length} APAAR IDs from a pasted list${problems.length ? `, ${problems.length} lines could not be matched` : ""}`,
  });

  revalidatePath("/app/apaar");
  return { ok: true, applied: applied.length, problems };
}

/**
 * Adopt the Aadhaar spelling as the school record. The commonest APAAR failure
 * is a name mismatch, and the fix is almost always "make the school match
 * Aadhaar" — but it must be a deliberate, audited act, not a silent overwrite.
 */
export async function adoptAadhaarName(studentId: string) {
  const actor = await requireRole(...OFFICE);

  const student = await db.student.findFirst({
    where: { id: studentId, schoolId: actor.schoolId },
    select: { id: true, name: true, aadhaarName: true },
  });
  if (!student) return { error: "That student is not on this school's roll." };
  if (!student.aadhaarName?.trim()) {
    return { error: "No Aadhaar name is recorded for this student yet." };
  }

  const check = nameMismatch(student.name, student.aadhaarName);
  if (check.matches) return { error: "The names already match." };

  await db.student.update({
    where: { id: student.id },
    data: {
      name: student.aadhaarName.trim(),
      apaarStatus: "CONSENT_PENDING",
      apaarNote: `School record changed from "${student.name}" to match Aadhaar`,
      apaarUpdatedAt: new Date(),
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "apaar.name.adopt",
    entity: "Student",
    entityId: student.id,
    summary: `Renamed "${student.name}" to "${student.aadhaarName.trim()}" to match Aadhaar for APAAR`,
    before: { name: student.name },
    after: { name: student.aadhaarName.trim() },
    reversible: true,
  });

  revalidatePath("/app/apaar");
  revalidatePath(`/app/students/${student.id}`);
  return { ok: true };
}

/** Mark a batch as submitted to UDISE+ so the office knows what it is waiting on. */
export async function markSubmitted(studentIds: string[]) {
  const actor = await requireRole(...OFFICE);
  if (studentIds.length === 0) return { error: "Select at least one student." };

  const result = await db.student.updateMany({
    where: { id: { in: studentIds }, schoolId: actor.schoolId, apaarId: null },
    data: { apaarStatus: "SUBMITTED", apaarUpdatedAt: new Date() },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "apaar.submit",
    entity: "School",
    entityId: actor.schoolId,
    summary: `Marked ${result.count} students as submitted to UDISE+`,
  });

  revalidatePath("/app/apaar");
  return { ok: true, count: result.count };
}
