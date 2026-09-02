"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, MONEY, OFFICE } from "@/lib/session";
import { formatMoney, paiseFromText } from "@/lib/core/money";
import {
  canDeleteConcessionType, canGrantConcession,
  validateConcessionType, validateFinePolicy,
} from "@/lib/core/concession-core";

/**
 * Concessions and the late fee.
 *
 * Both decide real money and both were seed-only: a school could not create the
 * concession its RTE children are entitled to, could not grant one, could not
 * approve one, and could not say what it charges for paying late — while
 * `buildInvoice` and `lateFineFor` sat there ready to apply whatever they were told.
 *
 * Approval is a separate act from granting on purpose. `gatherTermBilling` refuses to
 * apply an unapproved concession, so a clerk can record what a family has asked for
 * without it changing anybody's invoice until somebody with the authority says yes.
 */

export async function createConcessionType(input: {
  name: string;
  percentage?: number | null;
  fixedAmountText?: string | null;
  appliesToHeads?: string[] | null;
  requiresApproval?: boolean;
}) {
  const actor = await requireRole(...MONEY);

  const fixed = input.fixedAmountText?.trim() ? paiseFromText(input.fixedAmountText) : null;
  if (input.fixedAmountText?.trim() && fixed == null) return { error: "That is not an amount." };

  const existing = await db.concessionType.findMany({
    where: { schoolId: actor.schoolId },
    select: { name: true },
  });
  const check = validateConcessionType({
    name: input.name,
    percentage: input.percentage ?? null,
    fixedAmountPaise: fixed,
    existingNames: existing.map((e) => e.name),
  });
  if (!check.ok) {
    return { error: check.messages.find((m) => m.level === "ERROR")!.message, messages: check.messages };
  }

  const heads = input.appliesToHeads?.length
    ? await db.feeHead.findMany({
        where: { schoolId: actor.schoolId, id: { in: input.appliesToHeads } },
        select: { id: true, name: true },
      })
    : [];
  if (input.appliesToHeads?.length && heads.length !== input.appliesToHeads.length) {
    return { error: "One of those fee heads is not in this school." };
  }

  const name = input.name.trim().replace(/\s+/g, " ");
  const made = await db.concessionType.create({
    data: {
      schoolId: actor.schoolId,
      name,
      percentage: input.percentage ?? null,
      fixedAmount: fixed,
      appliesToHeads: heads.map((h) => h.id),
      requiresApproval: input.requiresApproval ?? true,
    },
    select: { id: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.concession.type.create",
    entity: "ConcessionType",
    entityId: made.id,
    summary:
      `Created the concession ${name}, ` +
      (input.percentage != null ? `${input.percentage}% off ` : `${formatMoney(fixed ?? 0)} off `) +
      (heads.length > 0 ? heads.map((h) => h.name).join(" and ") : "every fee head"),
  });

  revalidatePath("/app/fees/concessions");
  revalidatePath("/app/fees/structures");
  return { ok: true as const, messages: check.messages };
}

export async function updateConcessionType(input: {
  concessionTypeId: string;
  name: string;
  percentage?: number | null;
  fixedAmountText?: string | null;
  appliesToHeads?: string[] | null;
  requiresApproval?: boolean;
}) {
  const actor = await requireRole(...MONEY);

  const before = await db.concessionType.findFirst({
    where: { id: input.concessionTypeId, schoolId: actor.schoolId },
    select: {
      id: true, name: true, percentage: true, fixedAmount: true, appliesToHeads: true,
      requiresApproval: true, _count: { select: { concessions: true } },
    },
  });
  if (!before) return { error: "That concession is not in this school." };

  const fixed = input.fixedAmountText?.trim() ? paiseFromText(input.fixedAmountText) : null;
  if (input.fixedAmountText?.trim() && fixed == null) return { error: "That is not an amount." };

  const siblings = await db.concessionType.findMany({
    where: { schoolId: actor.schoolId, id: { not: before.id } },
    select: { name: true },
  });
  const check = validateConcessionType({
    name: input.name,
    percentage: input.percentage ?? null,
    fixedAmountPaise: fixed,
    existingNames: siblings.map((s) => s.name),
  });
  if (!check.ok) {
    return { error: check.messages.find((m) => m.level === "ERROR")!.message, messages: check.messages };
  }

  const heads = input.appliesToHeads?.length
    ? await db.feeHead.findMany({
        where: { schoolId: actor.schoolId, id: { in: input.appliesToHeads } },
        select: { id: true, name: true },
      })
    : [];

  const name = input.name.trim().replace(/\s+/g, " ");
  await db.concessionType.update({
    where: { id: before.id },
    data: {
      name,
      percentage: input.percentage ?? null,
      fixedAmount: fixed,
      appliesToHeads: heads.map((h) => h.id),
      requiresApproval: input.requiresApproval ?? before.requiresApproval,
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.concession.type.update",
    entity: "ConcessionType",
    entityId: before.id,
    summary:
      `Changed the concession ${before.name}` +
      (before._count.concessions > 0
        ? `, which ${before._count.concessions} ${before._count.concessions === 1 ? "child is" : "children are"} on. Invoices already raised are unchanged.`
        : "."),
    before: { name: before.name, percentage: before.percentage, fixedAmount: before.fixedAmount, heads: before.appliesToHeads },
    after: { name, percentage: input.percentage ?? null, fixedAmount: fixed, heads: heads.map((h) => h.id) },
    reversible: true,
  });

  revalidatePath("/app/fees/concessions");
  revalidatePath("/app/fees/structures");
  return { ok: true as const, messages: check.messages };
}

export async function deleteConcessionType(input: { concessionTypeId: string }) {
  const actor = await requireRole(...MONEY);

  const type = await db.concessionType.findFirst({
    where: { id: input.concessionTypeId, schoolId: actor.schoolId },
    select: { id: true, name: true, _count: { select: { concessions: true } } },
  });
  if (!type) return { error: "That concession is not in this school." };

  const guard = canDeleteConcessionType({ students: type._count.concessions });
  if (!guard.allowed) return { error: guard.reason! };

  await db.concessionType.delete({ where: { id: type.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.concession.type.delete",
    entity: "ConcessionType",
    entityId: type.id,
    summary: `Removed the concession ${type.name}, which nobody was on`,
  });

  revalidatePath("/app/fees/concessions");
  return { ok: true as const };
}

/** Give a child a concession. Recording it is not the same as approving it. */
export async function grantConcession(input: {
  studentId: string;
  concessionTypeId: string;
  percentage?: number | null;
  fixedAmountText?: string | null;
  note?: string | null;
  approveNow?: boolean;
}) {
  const actor = await requireRole(...MONEY);

  const [student, type] = await Promise.all([
    db.student.findFirst({
      where: { id: input.studentId, schoolId: actor.schoolId },
      select: {
        id: true, name: true, status: true, admissionNumber: true,
        concessions: { select: { concessionTypeId: true } },
      },
    }),
    db.concessionType.findFirst({
      where: { id: input.concessionTypeId, schoolId: actor.schoolId },
      select: { id: true, name: true, percentage: true, fixedAmount: true, requiresApproval: true },
    }),
  ]);
  if (!student) return { error: "That child is not on this school's roll." };
  if (!type) return { error: "That concession is not in this school." };

  const guard = canGrantConcession({
    studentStatus: student.status,
    alreadyHasThisType: student.concessions.some((c) => c.concessionTypeId === type.id),
    otherConcessions: student.concessions.length,
  });
  if (!guard.allowed) return { error: guard.reason! };

  const fixed = input.fixedAmountText?.trim() ? paiseFromText(input.fixedAmountText) : null;
  if (input.fixedAmountText?.trim() && fixed == null) return { error: "That is not an amount." };

  // An override has to be a valid concession in its own right, or a typed 150% would
  // pay the family to attend.
  if (input.percentage != null || fixed != null) {
    const check = validateConcessionType({
      name: type.name,
      percentage: input.percentage ?? null,
      fixedAmountPaise: fixed,
    });
    if (!check.ok) return { error: check.messages.find((m) => m.level === "ERROR")!.message };
  }

  const approved = Boolean(input.approveNow) || !type.requiresApproval;
  const made = await db.studentConcession.create({
    data: {
      schoolId: actor.schoolId,
      studentId: student.id,
      concessionTypeId: type.id,
      percentage: input.percentage ?? null,
      fixedAmount: fixed,
      note: input.note?.trim() || null,
      approvedAt: approved ? new Date() : null,
      approvedBy: approved ? actor.id : null,
    },
    select: { id: true },
  });

  const worth =
    input.percentage != null
      ? `${input.percentage}%`
      : fixed != null
        ? formatMoney(fixed)
        : type.percentage != null
          ? `${type.percentage}%`
          : formatMoney(type.fixedAmount ?? 0);

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.concession.grant",
    entity: "Student",
    entityId: student.id,
    summary:
      `${student.name} (${student.admissionNumber}) given the ${type.name} concession, ${worth}` +
      (approved ? ", approved" : " — waiting for approval, so it changes nothing yet") +
      (input.note?.trim() ? `. ${input.note.trim()}` : ""),
  });

  revalidatePath(`/app/students/${student.id}`);
  revalidatePath("/app/fees/concessions");
  return { ok: true as const, concessionId: made.id, approved };
}

/**
 * Approving one. Separate from granting, and only the office — an accountant records
 * what a family asks for; somebody senior decides what the school gives away.
 */
export async function approveConcession(input: { concessionId: string }) {
  const actor = await requireRole(...OFFICE);

  const c = await db.studentConcession.findFirst({
    where: { id: input.concessionId, schoolId: actor.schoolId },
    select: {
      id: true, approvedAt: true,
      student: { select: { id: true, name: true, admissionNumber: true } },
      concessionType: { select: { name: true } },
    },
  });
  if (!c) return { error: "That concession is not in this school." };
  if (c.approvedAt) return { ok: true as const };

  await db.studentConcession.update({
    where: { id: c.id },
    data: { approvedAt: new Date(), approvedBy: actor.id },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.concession.approve",
    entity: "Student",
    entityId: c.student.id,
    summary: `Approved ${c.student.name}'s ${c.concessionType.name} concession. It comes off from the next invoice raised.`,
  });

  revalidatePath(`/app/students/${c.student.id}`);
  revalidatePath("/app/fees/concessions");
  return { ok: true as const };
}

export async function revokeConcession(input: { concessionId: string; reason: string }) {
  const actor = await requireRole(...OFFICE);

  const c = await db.studentConcession.findFirst({
    where: { id: input.concessionId, schoolId: actor.schoolId },
    select: {
      id: true, approvedAt: true,
      student: { select: { id: true, name: true } },
      concessionType: { select: { name: true } },
    },
  });
  if (!c) return { error: "That concession is not in this school." };
  if (!input.reason?.trim()) return { error: "Say why it is being taken away — the family will ask." };

  await db.studentConcession.delete({ where: { id: c.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.concession.revoke",
    entity: "Student",
    entityId: c.student.id,
    summary:
      `Took away ${c.student.name}'s ${c.concessionType.name} concession: ${input.reason.trim()}. ` +
      "Invoices already raised keep it; the next one will not.",
  });

  revalidatePath(`/app/students/${c.student.id}`);
  revalidatePath("/app/fees/concessions");
  return { ok: true as const };
}

/** What the school charges for paying late. One policy, active or not. */
export async function saveFinePolicy(input: {
  graceDays: number;
  flatAmountText?: string | null;
  perDayAmountText?: string | null;
  maxAmountText?: string | null;
  isActive: boolean;
}) {
  const actor = await requireRole(...MONEY);

  const flat = input.flatAmountText?.trim() ? paiseFromText(input.flatAmountText) : 0;
  const perDay = input.perDayAmountText?.trim() ? paiseFromText(input.perDayAmountText) : 0;
  const max = input.maxAmountText?.trim() ? paiseFromText(input.maxAmountText) : null;
  if (flat == null || perDay == null) return { error: "One of those charges is not an amount." };
  if (input.maxAmountText?.trim() && max == null) return { error: "That cap is not an amount." };

  const check = validateFinePolicy({
    graceDays: input.graceDays,
    flatAmountPaise: flat,
    perDayAmountPaise: perDay,
    maxAmountPaise: max,
  });
  if (!check.ok) {
    return { error: check.messages.find((m) => m.level === "ERROR")!.message, messages: check.messages };
  }

  const existing = await db.lateFinePolicy.findFirst({
    where: { schoolId: actor.schoolId },
    select: { id: true, graceDays: true, flatAmount: true, perDayAmount: true, maxAmount: true, isActive: true },
  });

  if (existing) {
    await db.lateFinePolicy.update({
      where: { id: existing.id },
      data: {
        graceDays: input.graceDays,
        flatAmount: flat,
        perDayAmount: perDay,
        maxAmount: max,
        isActive: input.isActive,
      },
    });
  } else {
    await db.lateFinePolicy.create({
      data: {
        schoolId: actor.schoolId,
        graceDays: input.graceDays,
        flatAmount: flat,
        perDayAmount: perDay,
        maxAmount: max,
        isActive: input.isActive,
      },
    });
  }

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.finepolicy.save",
    entity: "LateFinePolicy",
    entityId: existing?.id ?? actor.schoolId,
    summary: input.isActive
      ? `Late fee: ${input.graceDays} days grace, then ${formatMoney(flat)} flat` +
        (perDay > 0 ? ` plus ${formatMoney(perDay)} a day` : "") +
        (max != null ? `, capped at ${formatMoney(max)}` : ", uncapped") +
        ". It is never applied unless the counter ticks it."
      : "Late fee switched off. Nothing extra is charged for paying late.",
    before: existing ?? undefined,
    after: { graceDays: input.graceDays, flatAmount: flat, perDayAmount: perDay, maxAmount: max, isActive: input.isActive },
    reversible: true,
  });

  revalidatePath("/app/fees/concessions");
  revalidatePath("/app/fees/structures");
  return { ok: true as const, messages: check.messages };
}
