"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, MONEY } from "@/lib/session";
import { formatMoney, paiseFromText } from "@/lib/core/money";
import { canDeleteFeeHead, validateFeeAmount, validateFeeHeadName } from "@/lib/core/setup-core";

/**
 * What the school charges, and how much of it per class.
 *
 * This screen used to end with a line promising that editing was "coming in the
 * next pass", which meant a school could not raise its own fees, add a head, or
 * move a term's due date without someone editing the database. It is the last
 * piece of setup that was still seed-only.
 *
 * Two things are deliberately true of everything here:
 *
 * - **Nothing touches an invoice already raised.** FeeInvoice.lineItems is a Json
 *   snapshot taken when the invoice was made, so a fee that changes in August
 *   cannot silently rewrite what a parent was billed in April. Amounts here decide
 *   what the *next* invoice says.
 * - **Zero means the head does not apply.** Setting a cell to 0 removes the
 *   FeeStructureItem rather than leaving a ₹0 line on a parent's invoice — and
 *   that is the same act canDeleteFeeHead asks for before a head can go.
 */

/** The structure a class charges from, made if this is the first time it is priced. */
async function structureFor(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  schoolId: string,
  classId: string,
  className: string,
  academicYearId: string,
  yearName: string,
) {
  const existing = await tx.feeStructure.findFirst({
    where: { schoolId, classId, academicYearId, isActive: true },
    select: { id: true },
  });
  if (existing) return existing.id;

  const made = await tx.feeStructure.create({
    data: {
      schoolId,
      academicYearId,
      classId,
      name: `${className} — ${yearName}`,
      frequency: "TERM",
    },
    select: { id: true },
  });
  return made.id;
}

export async function createFeeHead(input: {
  name: string;
  code?: string | null;
  isOptional?: boolean;
  isRefundable?: boolean;
}) {
  const actor = await requireRole(...MONEY);

  const heads = await db.feeHead.findMany({
    where: { schoolId: actor.schoolId },
    select: { name: true, sequenceOrder: true },
  });
  const check = validateFeeHeadName(input.name, heads.map((h) => h.name));
  if (!check.allowed) return { error: check.reason! };

  const name = input.name.trim().replace(/\s+/g, " ");
  const head = await db.feeHead.create({
    data: {
      schoolId: actor.schoolId,
      name,
      code: input.code?.trim() || null,
      isOptional: Boolean(input.isOptional),
      isRefundable: Boolean(input.isRefundable),
      sequenceOrder: heads.reduce((a, h) => Math.max(a, h.sequenceOrder), 0) + 1,
    },
    select: { id: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.head.create",
    entity: "FeeHead",
    entityId: head.id,
    summary: `Added the fee head ${name}${input.isOptional ? ", charged only to those who opt in" : ""}`,
  });

  revalidatePath("/app/fees/structures");
  return { ok: true as const };
}

export async function updateFeeHead(input: {
  feeHeadId: string;
  name: string;
  code?: string | null;
  isOptional?: boolean;
  isRefundable?: boolean;
}) {
  const actor = await requireRole(...MONEY);

  const before = await db.feeHead.findFirst({
    where: { id: input.feeHeadId, schoolId: actor.schoolId },
    select: { id: true, name: true, code: true, isOptional: true, isRefundable: true },
  });
  if (!before) return { error: "That fee head is not in this school." };

  const siblings = await db.feeHead.findMany({
    where: { schoolId: actor.schoolId, id: { not: before.id } },
    select: { name: true },
  });
  const check = validateFeeHeadName(input.name, siblings.map((h) => h.name));
  if (!check.allowed) return { error: check.reason! };

  const name = input.name.trim().replace(/\s+/g, " ");
  await db.feeHead.update({
    where: { id: before.id },
    data: {
      name,
      code: input.code?.trim() || null,
      isOptional: Boolean(input.isOptional),
      isRefundable: Boolean(input.isRefundable),
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.head.update",
    entity: "FeeHead",
    entityId: before.id,
    // A rename shows on every future invoice, so the old name has to stay findable.
    summary: name === before.name ? `Changed the fee head ${name}` : `Renamed the fee head ${before.name} to ${name}`,
    before: { name: before.name, code: before.code, isOptional: before.isOptional, isRefundable: before.isRefundable },
    after: { name, code: input.code ?? null, isOptional: Boolean(input.isOptional), isRefundable: Boolean(input.isRefundable) },
    reversible: true,
  });

  revalidatePath("/app/fees/structures");
  return { ok: true as const };
}

export async function deleteFeeHead(input: { feeHeadId: string }) {
  const actor = await requireRole(...MONEY);

  const head = await db.feeHead.findFirst({
    where: { id: input.feeHeadId, schoolId: actor.schoolId },
    select: { id: true, name: true, _count: { select: { items: true } } },
  });
  if (!head) return { error: "That fee head is not in this school." };

  const check = canDeleteFeeHead({ items: head._count.items });
  if (!check.allowed) return { error: check.reason! };

  await db.feeHead.delete({ where: { id: head.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.head.delete",
    entity: "FeeHead",
    entityId: head.id,
    summary: `Removed the fee head ${head.name}. Invoices already raised keep it, because they carry their own copy of every line.`,
  });

  revalidatePath("/app/fees/structures");
  return { ok: true as const };
}

/** The order heads appear in on the grid, and on the parent's invoice. */
export async function moveFeeHead(input: { feeHeadId: string; direction: "UP" | "DOWN" }) {
  const actor = await requireRole(...MONEY);

  const heads = await db.feeHead.findMany({
    where: { schoolId: actor.schoolId },
    orderBy: [{ sequenceOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const at = heads.findIndex((h) => h.id === input.feeHeadId);
  if (at === -1) return { error: "That fee head is not in this school." };

  const to = input.direction === "UP" ? at - 1 : at + 1;
  if (to < 0 || to >= heads.length) return { ok: true as const }; // already at the end — not an error

  const order = [...heads];
  [order[at], order[to]] = [order[to], order[at]];

  // Rewrite the whole run rather than swapping two numbers: the seed left several
  // heads sharing a sequenceOrder, and a swap between equals moves nothing.
  await db.$transaction(
    order.map((h, i) => db.feeHead.update({ where: { id: h.id }, data: { sequenceOrder: i } })),
  );

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.head.reorder",
    entity: "FeeHead",
    entityId: input.feeHeadId,
    summary: `Moved ${heads[at].name} ${input.direction === "UP" ? "above" : "below"} ${heads[to].name} on the invoice`,
  });

  revalidatePath("/app/fees/structures");
  return { ok: true as const };
}

/**
 * What one class pays, head by head, for the year.
 *
 * Written as a whole row in one transaction: a fee structure that is half-saved
 * is a class whose annual total is wrong, and the total is what the term invoice
 * is divided out of.
 */
export async function setClassFees(input: { classId: string; amounts: Record<string, string> }) {
  const actor = await requireRole(...MONEY);

  const [cls, year, heads] = await Promise.all([
    db.class.findFirst({
      where: { id: input.classId, schoolId: actor.schoolId },
      select: { id: true, name: true },
    }),
    db.academicYear.findFirst({
      where: { schoolId: actor.schoolId, isCurrent: true },
      select: { id: true, name: true },
    }),
    db.feeHead.findMany({ where: { schoolId: actor.schoolId }, select: { id: true, name: true } }),
  ]);
  if (!cls) return { error: "That class is not in this school." };
  if (!year) return { error: "There is no current academic year, so there is nothing to price. Set one first." };

  const known = new Map(heads.map((h) => [h.id, h.name]));
  const parsed: { feeHeadId: string; amount: number }[] = [];
  for (const [feeHeadId, text] of Object.entries(input.amounts)) {
    if (!known.has(feeHeadId)) return { error: "One of those fee heads is not in this school." };
    const raw = String(text ?? "").trim();
    const amount = raw === "" ? 0 : paiseFromText(raw);
    const check = validateFeeAmount(amount);
    if (!check.allowed) return { error: `${known.get(feeHeadId)}: ${check.reason}` };
    parsed.push({ feeHeadId, amount: amount! });
  }

  const beforeItems = await db.feeStructureItem.findMany({
    where: { feeStructure: { schoolId: actor.schoolId, classId: cls.id, academicYearId: year.id, isActive: true } },
    select: { feeHeadId: true, amount: true },
  });
  const wasTotal = beforeItems.reduce((a, i) => a + i.amount, 0);
  const nowTotal = parsed.reduce((a, p) => a + p.amount, 0);

  await db.$transaction(async (tx) => {
    const structureId = await structureFor(tx, actor.schoolId, cls.id, cls.name, year.id, year.name);
    for (const p of parsed) {
      if (p.amount === 0) {
        await tx.feeStructureItem.deleteMany({ where: { feeStructureId: structureId, feeHeadId: p.feeHeadId } });
        continue;
      }
      await tx.feeStructureItem.upsert({
        where: { feeStructureId_feeHeadId: { feeStructureId: structureId, feeHeadId: p.feeHeadId } },
        create: { feeStructureId: structureId, feeHeadId: p.feeHeadId, amount: p.amount },
        update: { amount: p.amount },
      });
    }
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.structure.update",
    entity: "Class",
    entityId: cls.id,
    summary:
      wasTotal === nowTotal
        ? `Reworked ${cls.name}'s fees, annual total unchanged at ${formatMoney(nowTotal)}`
        : `${cls.name}'s annual fee ${nowTotal > wasTotal ? "raised" : "reduced"} from ${formatMoney(wasTotal)} to ${formatMoney(nowTotal)}. Invoices already raised are unchanged.`,
    before: Object.fromEntries(beforeItems.map((i) => [known.get(i.feeHeadId) ?? i.feeHeadId, i.amount])),
    after: Object.fromEntries(parsed.filter((p) => p.amount > 0).map((p) => [known.get(p.feeHeadId)!, p.amount])),
    reversible: true,
  });

  revalidatePath("/app/fees/structures");
  revalidatePath("/app/fees");
  return { ok: true as const };
}
