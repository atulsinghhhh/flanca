"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { nextNumber } from "@/lib/sequence";
import type { ConsentPurpose, ConsentState } from "@prisma/client";
import {
  humanPurpose, isVerificationMethod, maskPhone, NOTICE_VERSION,
} from "@/lib/core/consent-core";

/**
 * Write one consent decision, with everything that must happen alongside it.
 *
 * Both the single and the bulk path go through here. They did not, and they drifted:
 * the bulk path — the only one the UI actually exposes — never issued a receipt
 * number, so the "proof a parent can be handed" existed on paper only, and refusing
 * APAAR consent in bulk left those children queued for APAAR generation anyway. A
 * right that changes nothing downstream is not a right.
 *
 * The number, the record and its consequence share one transaction: a CNS/ number
 * must not be consumed by a write that then fails, and consent must never disagree
 * with what the school does next.
 */
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

    // Withdrawing or refusing APAAR consent stops the APAAR workflow, not just the
    // register. Same transaction, so the two can never disagree.
    if (purpose === "APAAR_GENERATION" && (state === "REFUSED" || state === "WITHDRAWN")) {
      await tx.student.update({
        where: { id: studentId },
        data: { apaarStatus: "CONSENT_REFUSED", apaarUpdatedAt: now },
      });
    }

    return receiptNo;
  });
}

/**
 * Record a consent decision.
 *
 * The DPDP Act requires VERIFIABLE parental consent before a child's data is
 * processed — including photographs. So every GRANTED record must carry how the
 * parent was verified and who gave it; a bare "yes" is refused here.
 */
export async function recordConsent(input: {
  studentId: string;
  purpose: ConsentPurpose;
  state: ConsentState;
  verifiedVia?: string;
  grantedByName?: string;
  verifiedRef?: string;
}) {
  const actor = await requireRole(...OFFICE);

  const student = await db.student.findFirst({
    where: { id: input.studentId, schoolId: actor.schoolId },
    select: { id: true, name: true, guardianPhone: true },
  });
  if (!student) return { error: "That student is not on this school's roll." };

  if (input.state === "GRANTED") {
    if (!input.verifiedVia) {
      return { error: "Record HOW the parent was verified — consent without verification does not satisfy the Act." };
    }
    if (!isVerificationMethod(input.verifiedVia)) {
      return { error: "That is not a recognised verification method." };
    }
    if (!input.grantedByName?.trim()) {
      return { error: "Record which parent or guardian gave consent." };
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

  revalidatePath("/app/consent");
  revalidatePath("/app/apaar");
  revalidatePath(`/app/students/${student.id}`);
  return { ok: true, receiptNo };
}

/** Capture the same consent for many students at once — e.g. a PTM signing drive. */
export async function bulkConsent(input: {
  studentIds: string[];
  purpose: ConsentPurpose;
  state: ConsentState;
  verifiedVia?: string;
}) {
  const actor = await requireRole(...OFFICE);
  if (input.studentIds.length === 0) return { error: "Select at least one student." };

  if (input.state === "GRANTED" && !input.verifiedVia) {
    return { error: "Record how these parents were verified before granting consent in bulk." };
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

  revalidatePath("/app/consent");
  revalidatePath("/app/apaar");
  return { ok: true, count: done };
}


