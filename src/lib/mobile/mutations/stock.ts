import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import { paiseFromText } from "@/lib/core/money";
import { applyStockTxn, validateItem, type ItemField, type OpsMessage } from "@/lib/core/operations-core";
import { schoolToday } from "@/lib/queries/when";

/**
 * The mobile-API twin of src/app/app/stock/actions.ts.
 *
 * Same rules (validateItem / applyStockTxn from operations-core, never
 * re-derived), same db writes (an InventoryTxn and the item's quantity in one
 * transaction), same audit trail — just handed an `actor` instead of calling
 * `requireRole(...OFFICE)`, and returning a discriminated result instead of
 * the `{error}`/`{ok}` shape a server action's caller expects.
 * revalidatePath is a page-cache concern with nothing to invalidate for a
 * stateless JSON client, so it is dropped here.
 */

type Failure = { ok: false; status: number; code: string; message: string };

const notFound = (message: string): Failure => ({ ok: false, status: 404, code: "not_found", message });
const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });

export type SaveItemInput = {
  itemId?: string | null;
  name: string;
  group?: string | null;
  unit: string;
  reorderAt?: number | null;
  unitPriceText?: string | null;
  supplier?: string | null;
  openingQuantity?: number | null;
};

export type SaveItemResult = Failure | { ok: true; itemId: string; messages: OpsMessage<ItemField>[] };

/** Mirrors src/app/app/stock/actions.ts::saveItem — creates or updates depending on itemId. */
export async function saveItemForActor(actor: Actor, input: SaveItemInput): Promise<SaveItemResult> {
  const price = input.unitPriceText?.trim() ? paiseFromText(input.unitPriceText) : null;
  if (input.unitPriceText?.trim() && price == null) return invalid("That price is not an amount.");

  const items = await db.inventoryItem.findMany({
    where: { schoolId: actor.schoolId },
    select: { id: true, name: true },
  });
  const check = validateItem({
    name: input.name,
    unit: input.unit,
    reorderAt: input.reorderAt ?? null,
    unitPricePaise: price,
    existingNames: items.filter((i) => i.id !== input.itemId).map((i) => i.name),
  });
  if (!check.ok) {
    return invalid(check.messages.find((m) => m.level === "ERROR")!.message);
  }

  const name = input.name.trim().replace(/\s+/g, " ");
  const data = {
    name,
    group: input.group?.trim() || null,
    unit: input.unit.trim(),
    reorderAt: input.reorderAt ?? null,
    unitPrice: price,
    supplier: input.supplier?.trim() || null,
  };

  if (input.itemId) {
    const existing = await db.inventoryItem.findFirst({
      where: { id: input.itemId, schoolId: actor.schoolId },
      select: { id: true, name: true, unit: true, quantity: true, reorderAt: true },
    });
    if (!existing) return notFound("That item is not in the store.");

    await db.inventoryItem.update({ where: { id: existing.id }, data });
    await audit({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: "school.stock.item.update",
      entity: "InventoryItem",
      entityId: existing.id,
      summary: `Changed the store item ${existing.name}${name !== existing.name ? ` to ${name}` : ""}`,
      before: { name: existing.name, unit: existing.unit, reorderAt: existing.reorderAt },
      after: data,
      reversible: true,
    });
    return { ok: true, itemId: existing.id, messages: check.messages };
  }

  const opening = input.openingQuantity ?? 0;
  if (!Number.isInteger(opening) || opening < 0) return invalid("An opening quantity cannot be negative.");

  const made = await db.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({
      data: { schoolId: actor.schoolId, ...data, quantity: opening },
      select: { id: true },
    });
    // Even the opening balance gets a movement, so the register explains every unit
    // on the shelf rather than starting with an unexplained number.
    if (opening > 0) {
      await tx.inventoryTxn.create({
        data: {
          schoolId: actor.schoolId,
          itemId: created.id,
          kind: "IN",
          quantity: opening,
          reason: "Opening stock",
          date: schoolToday(),
        },
      });
    }
    return created;
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.stock.item.create",
    entity: "InventoryItem",
    entityId: made.id,
    summary: `Added ${name} to the store${opening > 0 ? `, opening stock ${opening} ${data.unit}` : ""}`,
  });

  return { ok: true, itemId: made.id, messages: check.messages };
}

export type RecordMovementInput = {
  itemId: string;
  kind: "IN" | "OUT" | "ADJUST";
  quantity: number;
  reason?: string | null;
  billNo?: string | null;
  dateIso?: string | null;
};

export type RecordMovementResult = Failure | { ok: true; quantity: number };

/**
 * A delivery in, an issue out, or a correction after counting the shelf.
 * Mirrors src/app/app/stock/actions.ts::recordMovement.
 */
export async function recordMovementForActor(actor: Actor, input: RecordMovementInput): Promise<RecordMovementResult> {
  const item = await db.inventoryItem.findFirst({
    where: { id: input.itemId, schoolId: actor.schoolId },
    select: { id: true, name: true, unit: true, quantity: true },
  });
  if (!item) return notFound("That item is not in the store.");

  const applied = applyStockTxn({ kind: input.kind, quantity: input.quantity, current: item.quantity });
  if (!applied.allowed) return invalid(applied.reason!);

  if (input.kind === "ADJUST" && !input.reason?.trim()) {
    // A correction with no reason is indistinguishable from a mistake, and it is the
    // one movement that can make stock appear or vanish.
    return invalid("Say why the count is being corrected — that is the whole value of a correction.");
  }

  await db.$transaction([
    db.inventoryTxn.create({
      data: {
        schoolId: actor.schoolId,
        itemId: item.id,
        kind: input.kind,
        quantity: input.quantity,
        reason: input.reason?.trim() || null,
        billNo: input.billNo?.trim() || null,
        date: input.dateIso ? new Date(`${input.dateIso}T00:00:00.000Z`) : schoolToday(),
      },
    }),
    db.inventoryItem.update({ where: { id: item.id }, data: { quantity: applied.next } }),
  ]);

  const verb = input.kind === "IN" ? "Received" : input.kind === "OUT" ? "Issued" : "Corrected";
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.stock.movement",
    entity: "InventoryItem",
    entityId: item.id,
    summary:
      input.kind === "ADJUST"
        ? `${verb} ${item.name} to ${applied.next} ${item.unit}, was ${item.quantity}: ${input.reason?.trim()}`
        : `${verb} ${input.quantity} ${item.unit} of ${item.name}${input.reason?.trim() ? ` — ${input.reason.trim()}` : ""}. ${applied.next} ${item.unit} on the shelf.`,
    before: { quantity: item.quantity },
    after: { quantity: applied.next },
  });

  return { ok: true, quantity: applied.next };
}
