import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import { formatMoney, paiseFromText } from "@/lib/core/money";
import {
  canDeleteConcessionType, canGrantConcession,
  validateConcessionType, validateFinePolicy,
  type MoneyRuleMessage, type ConcessionField, type FineField,
} from "@/lib/core/concession-core";

/**
 * The mobile-API twin of src/app/app/fees/concessions/actions.ts — concessions
 * and the late fee. Same db writes, same audit trail, same authority split
 * (granting is MONEY, approving/revoking is OFFICE — enforced by the route,
 * not here), just handed an `actor` instead of calling `requireRole()`, and
 * returning a discriminated result instead of `{error}`/`{ok}`.
 */

type Failure = { ok: false; status: number; code: string; message: string };

const notFound = (message: string): Failure => ({ ok: false, status: 404, code: "not_found", message });
const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });
const conflict = (message: string): Failure => ({ ok: false, status: 409, code: "conflict", message });

export type CreateConcessionTypeInput = {
  name: string;
  percentage?: number | null;
  fixedAmountText?: string | null;
  appliesToHeads?: string[] | null;
  requiresApproval?: boolean;
};
export type CreateConcessionTypeResult =
  | Failure
  | { ok: true; concessionTypeId: string; messages: MoneyRuleMessage<ConcessionField>[] };

/** Mirrors createConcessionType. */
export async function createConcessionTypeForActor(
  actor: Actor,
  input: CreateConcessionTypeInput,
): Promise<CreateConcessionTypeResult> {
  const fixed = input.fixedAmountText?.trim() ? paiseFromText(input.fixedAmountText) : null;
  if (input.fixedAmountText?.trim() && fixed == null) return invalid("That is not an amount.");

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
  if (!check.ok) return invalid(check.messages.find((m) => m.level === "ERROR")!.message);

  const heads = input.appliesToHeads?.length
    ? await db.feeHead.findMany({
        where: { schoolId: actor.schoolId, id: { in: input.appliesToHeads } },
        select: { id: true, name: true },
      })
    : [];
  if (input.appliesToHeads?.length && heads.length !== input.appliesToHeads.length) {
    return invalid("One of those fee heads is not in this school.");
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

  return { ok: true, concessionTypeId: made.id, messages: check.messages };
}

export type UpdateConcessionTypeInput = {
  concessionTypeId: string;
  name: string;
  percentage?: number | null;
  fixedAmountText?: string | null;
  appliesToHeads?: string[] | null;
  requiresApproval?: boolean;
};
export type UpdateConcessionTypeResult = Failure | { ok: true; messages: MoneyRuleMessage<ConcessionField>[] };

/** Mirrors updateConcessionType. */
export async function updateConcessionTypeForActor(
  actor: Actor,
  input: UpdateConcessionTypeInput,
): Promise<UpdateConcessionTypeResult> {
  const before = await db.concessionType.findFirst({
    where: { id: input.concessionTypeId, schoolId: actor.schoolId },
    select: {
      id: true, name: true, percentage: true, fixedAmount: true, appliesToHeads: true,
      requiresApproval: true, _count: { select: { concessions: true } },
    },
  });
  if (!before) return notFound("That concession is not in this school.");

  const fixed = input.fixedAmountText?.trim() ? paiseFromText(input.fixedAmountText) : null;
  if (input.fixedAmountText?.trim() && fixed == null) return invalid("That is not an amount.");

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
  if (!check.ok) return invalid(check.messages.find((m) => m.level === "ERROR")!.message);

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

  return { ok: true, messages: check.messages };
}

export type DeleteConcessionTypeResult = Failure | { ok: true };

/** Mirrors deleteConcessionType. */
export async function deleteConcessionTypeForActor(
  actor: Actor,
  input: { concessionTypeId: string },
): Promise<DeleteConcessionTypeResult> {
  const type = await db.concessionType.findFirst({
    where: { id: input.concessionTypeId, schoolId: actor.schoolId },
    select: { id: true, name: true, _count: { select: { concessions: true } } },
  });
  if (!type) return notFound("That concession is not in this school.");

  const guard = canDeleteConcessionType({ students: type._count.concessions });
  if (!guard.allowed) return conflict(guard.reason!);

  await db.concessionType.delete({ where: { id: type.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.concession.type.delete",
    entity: "ConcessionType",
    entityId: type.id,
    summary: `Removed the concession ${type.name}, which nobody was on`,
  });

  return { ok: true };
}

export type GrantConcessionInput = {
  studentId: string;
  concessionTypeId: string;
  percentage?: number | null;
  fixedAmountText?: string | null;
  note?: string | null;
  approveNow?: boolean;
};
export type GrantConcessionResult = Failure | { ok: true; concessionId: string; approved: boolean };

/** Mirrors grantConcession — giving a child a concession. Recording it is not the same as approving it. */
export async function grantConcessionForActor(actor: Actor, input: GrantConcessionInput): Promise<GrantConcessionResult> {
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
  if (!student) return notFound("That child is not on this school's roll.");
  if (!type) return notFound("That concession is not in this school.");

  const guard = canGrantConcession({
    studentStatus: student.status,
    alreadyHasThisType: student.concessions.some((c) => c.concessionTypeId === type.id),
    otherConcessions: student.concessions.length,
  });
  if (!guard.allowed) return conflict(guard.reason!);

  const fixed = input.fixedAmountText?.trim() ? paiseFromText(input.fixedAmountText) : null;
  if (input.fixedAmountText?.trim() && fixed == null) return invalid("That is not an amount.");

  if (input.percentage != null || fixed != null) {
    const check = validateConcessionType({
      name: type.name,
      percentage: input.percentage ?? null,
      fixedAmountPaise: fixed,
    });
    if (!check.ok) return invalid(check.messages.find((m) => m.level === "ERROR")!.message);
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

  return { ok: true, concessionId: made.id, approved };
}

export type ApproveConcessionResult = Failure | { ok: true };

/** Mirrors approveConcession — separate from granting, only the office decides. */
export async function approveConcessionForActor(actor: Actor, input: { concessionId: string }): Promise<ApproveConcessionResult> {
  const c = await db.studentConcession.findFirst({
    where: { id: input.concessionId, schoolId: actor.schoolId },
    select: {
      id: true, approvedAt: true,
      student: { select: { id: true, name: true, admissionNumber: true } },
      concessionType: { select: { name: true } },
    },
  });
  if (!c) return notFound("That concession is not in this school.");
  if (c.approvedAt) return { ok: true };

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

  return { ok: true };
}

export type RevokeConcessionResult = Failure | { ok: true };

/** Mirrors revokeConcession. */
export async function revokeConcessionForActor(
  actor: Actor,
  input: { concessionId: string; reason: string },
): Promise<RevokeConcessionResult> {
  const c = await db.studentConcession.findFirst({
    where: { id: input.concessionId, schoolId: actor.schoolId },
    select: {
      id: true, approvedAt: true,
      student: { select: { id: true, name: true } },
      concessionType: { select: { name: true } },
    },
  });
  if (!c) return notFound("That concession is not in this school.");
  if (!input.reason?.trim()) return invalid("Say why it is being taken away — the family will ask.");

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

  return { ok: true };
}

export type SaveFinePolicyInput = {
  graceDays: number;
  flatAmountText?: string | null;
  perDayAmountText?: string | null;
  maxAmountText?: string | null;
  isActive: boolean;
};
export type SaveFinePolicyResult = Failure | { ok: true; messages: MoneyRuleMessage<FineField>[] };

/** Mirrors saveFinePolicy — what the school charges for paying late. One policy, active or not. */
export async function saveFinePolicyForActor(actor: Actor, input: SaveFinePolicyInput): Promise<SaveFinePolicyResult> {
  const flat = input.flatAmountText?.trim() ? paiseFromText(input.flatAmountText) : 0;
  const perDay = input.perDayAmountText?.trim() ? paiseFromText(input.perDayAmountText) : 0;
  const max = input.maxAmountText?.trim() ? paiseFromText(input.maxAmountText) : null;
  if (flat == null || perDay == null) return invalid("One of those charges is not an amount.");
  if (input.maxAmountText?.trim() && max == null) return invalid("That cap is not an amount.");

  const check = validateFinePolicy({
    graceDays: input.graceDays,
    flatAmountPaise: flat,
    perDayAmountPaise: perDay,
    maxAmountPaise: max,
  });
  if (!check.ok) return invalid(check.messages.find((m) => m.level === "ERROR")!.message);

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

  return { ok: true, messages: check.messages };
}
