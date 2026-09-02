import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import { APAAR_STATES, nameMismatch } from "@/lib/core/apaar-core";

/**
 * The mobile-API twin of src/app/app/apaar/actions.ts.
 *
 * Same 12-digit APAAR ID validation, same status derivation reuse, same
 * audited name-adoption act — just handed an `actor` instead of calling
 * `requireRole()`, and returning a discriminated result instead of the
 * `{error}`/`{ok}` shape a server action's caller expects, so a route handler
 * can turn it into the right HTTP status.
 *
 * `bulkRecordApaarIdsForActor` differs from the web action's
 * `bulkRecordApaarIds(pastedText)` in its input only: a phone won't paste a
 * spreadsheet block, so it takes a structured `records` array directly and
 * skips the line-splitting/column-splitting step. The matching-by-admission-
 * number and validation logic after that point is unchanged.
 *
 * revalidatePath is a Next.js page-cache concern with nothing to invalidate
 * for a stateless JSON client, so it is dropped here — everything else is
 * preserved.
 */

type Failure = { ok: false; status: number; code: string; message: string };

const notFound = (message = "That student is not on this school's roll."): Failure => ({
  ok: false,
  status: 404,
  code: "not_found",
  message,
});
const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });

export type UpdateApaarInput = {
  studentId: string;
  apaarId?: string;
  penNumber?: string;
  aadhaarName?: string;
  status?: string;
  note?: string;
};

export type UpdateApaarResult = Failure | { ok: true };

/** Record what the UDISE+ portal told us about one student. */
export async function updateApaarForActor(actor: Actor, input: UpdateApaarInput): Promise<UpdateApaarResult> {
  const student = await db.student.findFirst({
    where: { id: input.studentId, schoolId: actor.schoolId },
    select: { id: true, name: true, apaarId: true, apaarStatus: true, aadhaarName: true },
  });
  if (!student) return notFound();

  const apaarId = input.apaarId?.trim();
  // APAAR IDs are 12 digits. Rejecting a malformed one here saves a wasted
  // portal submission and a certification failure later.
  if (apaarId && !/^\d{12}$/.test(apaarId)) {
    return invalid("An APAAR ID is 12 digits. Check what the portal issued.");
  }
  if (input.status && !APAAR_STATES.includes(input.status as never)) {
    return invalid("That is not a valid APAAR status.");
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

  return { ok: true };
}

export type BulkApaarRecord = { admissionNumber: string; apaarId: string };

export type BulkApaarResult =
  | Failure
  | { ok: true; applied: number; problems: Array<{ admissionNumber: string; apaarId: string; reason: string }> };

/**
 * Match structured admission#/APAAR-ID pairs and record them.
 *
 * The web action (`bulkRecordApaarIds`) takes a pasted block of text and
 * splits it into lines and columns first; here the caller already supplies
 * one row per student, so this starts directly at the matching-by-admission-
 * number step the two paths share.
 */
export async function bulkRecordApaarIdsForActor(actor: Actor, records: BulkApaarRecord[]): Promise<BulkApaarResult> {
  if (records.length === 0) return invalid("Send at least one record.");

  const admissionNumbers = records.map((r) => r.admissionNumber).filter(Boolean);
  const students = await db.student.findMany({
    where: { schoolId: actor.schoolId, admissionNumber: { in: admissionNumbers } },
    select: { id: true, admissionNumber: true, name: true },
  });
  const byAdm = new Map(students.map((s) => [s.admissionNumber, s]));

  const applied: string[] = [];
  const problems: Array<{ admissionNumber: string; apaarId: string; reason: string }> = [];

  for (const row of records) {
    const student = byAdm.get(row.admissionNumber);
    if (!student) {
      problems.push({ admissionNumber: row.admissionNumber, apaarId: row.apaarId, reason: "No student with that admission number" });
      continue;
    }
    if (!/^\d{12}$/.test(row.apaarId)) {
      problems.push({ admissionNumber: row.admissionNumber, apaarId: row.apaarId, reason: "APAAR ID is not 12 digits" });
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
    summary: `Recorded ${applied.length} APAAR IDs from a mobile bulk submission${problems.length ? `, ${problems.length} rows could not be matched` : ""}`,
  });

  return { ok: true, applied: applied.length, problems };
}

export type AdoptAadhaarNameResult = Failure | { ok: true };

/**
 * Adopt the Aadhaar spelling as the school record. The commonest APAAR
 * failure is a name mismatch, and the fix is almost always "make the school
 * match Aadhaar" — but it must be a deliberate, audited act, not a silent
 * overwrite.
 */
export async function adoptAadhaarNameForActor(actor: Actor, studentId: string): Promise<AdoptAadhaarNameResult> {
  const student = await db.student.findFirst({
    where: { id: studentId, schoolId: actor.schoolId },
    select: { id: true, name: true, aadhaarName: true },
  });
  if (!student) return notFound();
  if (!student.aadhaarName?.trim()) {
    return invalid("No Aadhaar name is recorded for this student yet.");
  }

  const check = nameMismatch(student.name, student.aadhaarName);
  if (check.matches) return invalid("The names already match.");

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

  return { ok: true };
}

export type MarkSubmittedResult = Failure | { ok: true; count: number };

/** Mark a batch as submitted to UDISE+ so the office knows what it is waiting on. */
export async function markSubmittedForActor(actor: Actor, studentIds: string[]): Promise<MarkSubmittedResult> {
  if (studentIds.length === 0) return invalid("Select at least one student.");

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

  return { ok: true, count: result.count };
}
