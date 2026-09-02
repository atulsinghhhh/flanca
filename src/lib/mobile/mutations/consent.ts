import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import { nextNumber } from "@/lib/sequence";
import type { ConsentPurpose, ConsentState } from "@prisma/client";
import { humanPurpose, isVerificationMethod, maskPhone, NOTICE_VERSION } from "@/lib/core/consent-core";

/**
 * The mobile-API twin of src/app/app/consent/actions.ts.
 *
 * Same DPDP verification rules, same CNS/ receipt numbering, same
 * consent-drives-APAAR-status coupling — just handed an `actor` instead of
 * calling `requireRole()`, and returning a discriminated result instead of the
 * `{error}`/`{ok}` shape a server action's caller expects, so a route handler
 * can turn it into the right HTTP status.
 *
 * revalidatePath is a Next.js page-cache concern with nothing to invalidate
 * for a stateless JSON client, so it is dropped here — everything else is
 * preserved, including the single transaction that ties the receipt number,
 * the record and its APAAR consequence together.
 */

type Failure = { ok: false; status: number; code: string; message: string };

const notFound = (message = "That student is not on this school's roll."): Failure => ({
  ok: false,
  status: 404,
  code: "not_found",
  message,
});
const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });

async function writeConsent(params: {
  schoolId: string;
  studentId: string;
  purpose: ConsentPurpose;
  state: ConsentState;
  verifiedVia: string | null;
  verifiedRef: string | null;
  grantedByName: string | null;
  existingReceiptNo: string | null;
  now: Date;
}): Promise<string | null> {
  const { schoolId, studentId, purpose, state, now } = params;
  const granted = state === "GRANTED";

  return db.$transaction(async (tx) => {
    const receiptNo =
      granted && !params.existingReceiptNo
        ? await nextNumber(tx, schoolId, "CONSENT", "CNS/")
        : params.existingReceiptNo;

    const fields = {
      state,
      verifiedVia: granted ? params.verifiedVia : null,
      verifiedRef: params.verifiedRef,
      grantedByName: granted ? params.grantedByName : null,
      grantedAt: granted ? now : null,
      refusedAt: state === "REFUSED" ? now : null,
      withdrawnAt: state === "WITHDRAWN" ? now : null,
      noticeVersion: NOTICE_VERSION,
      receiptNo,
    };

    await tx.consentRecord.upsert({
      where: { studentId_purpose: { studentId, purpose } },
      create: { schoolId, studentId, purpose, ...fields },
      update: fields,
    });

    // Withdrawing or refusing APAAR consent stops the APAAR workflow, not just
    // the register. Same transaction, so the two can never disagree.
    if (purpose === "APAAR_GENERATION" && (state === "REFUSED" || state === "WITHDRAWN")) {
      await tx.student.update({
        where: { id: studentId },
        data: { apaarStatus: "CONSENT_REFUSED", apaarUpdatedAt: now },
      });
    }

    return receiptNo;
  });
}

export type RecordConsentInput = {
  studentId: string;
  purpose: ConsentPurpose;
  state: ConsentState;
  verifiedVia?: string;
  grantedByName?: string;
  verifiedRef?: string;
};

export type RecordConsentResult = Failure | { ok: true; receiptNo: string | null };

/**
 * Record a consent decision.
 *
 * The DPDP Act requires VERIFIABLE parental consent before a child's data is
 * processed — including photographs. So every GRANTED record must carry how
 * the parent was verified and who gave it; a bare "yes" is refused here.
 */
export async function recordConsentForActor(actor: Actor, input: RecordConsentInput): Promise<RecordConsentResult> {
  const student = await db.student.findFirst({
    where: { id: input.studentId, schoolId: actor.schoolId },
    select: { id: true, name: true, guardianPhone: true },
  });
  if (!student) return notFound();

  if (input.state === "GRANTED") {
    if (!input.verifiedVia) {
      return invalid("Record HOW the parent was verified — consent without verification does not satisfy the Act.");
    }
    if (!isVerificationMethod(input.verifiedVia)) {
      return invalid("That is not a recognised verification method.");
    }
    if (!input.grantedByName?.trim()) {
      return invalid("Record which parent or guardian gave consent.");
    }
  }

  const now = new Date();
  const existing = await db.consentRecord.findUnique({
    where: { studentId_purpose: { studentId: student.id, purpose: input.purpose } },
  });

  const receiptNo = await writeConsent({
    schoolId: actor.schoolId,
    studentId: student.id,
    purpose: input.purpose,
    state: input.state,
    verifiedVia: input.verifiedVia ?? null,
    verifiedRef: input.verifiedRef?.trim() || maskPhone(student.guardianPhone),
    grantedByName: input.grantedByName?.trim() ?? null,
    existingReceiptNo: existing?.receiptNo ?? null,
    now,
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "consent.record",
    entity: "Student",
    entityId: student.id,
    summary: `Consent for ${humanPurpose(input.purpose)} recorded as ${input.state.toLowerCase()} for ${student.name}${input.verifiedVia ? ` (verified by ${input.verifiedVia})` : ""}`,
    before: existing ? { state: existing.state } : undefined,
    after: { state: input.state, receiptNo },
  });

  return { ok: true, receiptNo };
}

export type BulkConsentInput = {
  studentIds: string[];
  purpose: ConsentPurpose;
  state: ConsentState;
  verifiedVia?: string;
};

export type BulkConsentResult = Failure | { ok: true; count: number };

/** Capture the same consent for many students at once — e.g. a PTM signing drive. */
export async function bulkConsentForActor(actor: Actor, input: BulkConsentInput): Promise<BulkConsentResult> {
  if (input.studentIds.length === 0) return invalid("Select at least one student.");

  if (input.state === "GRANTED" && !input.verifiedVia) {
    return invalid("Record how these parents were verified before granting consent in bulk.");
  }

  const students = await db.student.findMany({
    where: { id: { in: input.studentIds }, schoolId: actor.schoolId },
    select: { id: true, guardianPhone: true, fatherName: true },
  });

  const now = new Date();
  const existing = await db.consentRecord.findMany({
    where: { studentId: { in: students.map((s) => s.id) }, purpose: input.purpose },
    select: { studentId: true, receiptNo: true },
  });
  const receiptOf = new Map(existing.map((e) => [e.studentId, e.receiptNo]));

  let done = 0;
  let numbered = 0;

  for (const s of students) {
    const receiptNo = await writeConsent({
      schoolId: actor.schoolId,
      studentId: s.id,
      purpose: input.purpose,
      state: input.state,
      verifiedVia: input.verifiedVia ?? null,
      verifiedRef: maskPhone(s.guardianPhone),
      grantedByName: s.fatherName ?? "Parent/Guardian",
      existingReceiptNo: receiptOf.get(s.id) ?? null,
      now,
    });
    if (receiptNo) numbered++;
    done++;
  }

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "consent.bulk",
    entity: "School",
    entityId: actor.schoolId,
    summary: `${input.state === "GRANTED" ? "Granted" : "Recorded"} ${humanPurpose(input.purpose)} consent for ${done} students${input.verifiedVia ? ` (verified by ${input.verifiedVia})` : ""}${numbered > 0 ? `, ${numbered} with a consent receipt number` : ""}`,
  });

  return { ok: true, count: done };
}
