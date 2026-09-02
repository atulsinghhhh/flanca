"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { nextNumber } from "@/lib/sequence";

/** Log a visitor in. */
export async function logVisitor(input: {
  name: string;
  phone?: string;
  purpose?: string;
  whomToMeet?: string;
  idProof?: string;
}) {
  const actor = await requireRole(...OFFICE);
  if (!input.name.trim()) return { error: "Enter the visitor's name." };

  const visitor = await db.visitor.create({
    data: {
      schoolId: actor.schoolId,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      purpose: input.purpose?.trim() || null,
      whomToMeet: input.whomToMeet?.trim() || null,
      idProof: input.idProof?.trim() || null,
      passNo: `V-${Date.now().toString().slice(-5)}`,
    },
  });

  revalidatePath("/app/gate");
  return { ok: true, passNo: visitor.passNo };
}

export async function signVisitorOut(visitorId: string) {
  const actor = await requireRole(...OFFICE);
  const visitor = await db.visitor.findFirst({
    where: { id: visitorId, schoolId: actor.schoolId },
  });
  if (!visitor) return { error: "That visitor is not on today's log." };
  if (visitor.outAt) return { error: "Already signed out." };

  await db.visitor.update({ where: { id: visitor.id }, data: { outAt: new Date() } });
  revalidatePath("/app/gate");
  return { ok: true };
}

/**
 * Early pickup. This is a safety record: who took the child, on whose approval,
 * with a serial. It is the page a school gets asked for when something goes wrong.
 */
export async function issueGatePass(input: {
  studentId: string;
  reason: string;
  releasedTo: string;
  relation?: string;
}) {
  const actor = await requireRole(...OFFICE);

  const student = await db.student.findFirst({
    where: { id: input.studentId, schoolId: actor.schoolId, status: "ACTIVE" },
    select: { id: true, name: true, class: { select: { name: true } } },
  });
  if (!student) return { error: "That student is not on the roll." };
  if (!input.reason.trim()) return { error: "Record why the child is leaving early." };
  if (!input.releasedTo.trim()) return { error: "Record who the child is being released to." };

  // The number and the pass are written together. Allocating the number in its own
  // transaction first would consume it even when the pass below failed — and a
  // missing GP/ number is exactly what a parent disputing a release will point at.
  const { pass, passNo } = await db.$transaction(async (tx) => {
    const no = await nextNumber(tx, actor.schoolId, "GATEPASS", "GP/");
    const created = await tx.gatePass.create({
      data: {
        schoolId: actor.schoolId,
        studentId: student.id,
        passNo: no,
        reason: input.reason.trim(),
        releasedTo: input.releasedTo.trim(),
        relation: input.relation?.trim() || null,
        approvedBy: actor.id,
      },
    });
    return { pass: created, passNo: no };
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "gate.pass.issue",
    entity: "GatePass",
    entityId: pass.id,
    summary: `Gate pass ${passNo}: ${student.name} (${student.class?.name ?? "—"}) released to ${input.releasedTo.trim()} — ${input.reason.trim()}`,
  });

  revalidatePath("/app/gate");
  return { ok: true, passNo };
}
