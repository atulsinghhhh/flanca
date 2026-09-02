"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { paiseFromText } from "@/lib/core/money";
import { applyStockTxn, validateItem } from "@/lib/core/operations-core";
import { schoolToday } from "@/lib/queries/when";

/**
 * The store cupboard.
 *
 * Items and their quantities were seed-only, which made the screen a picture of a
 * store rather than a store. The act that matters is not creating an item — it is
 * receiving a delivery and issuing to a class, every day, and having the number on
 * the screen still be true at the end of the week.
 *
 * Every movement is written as an InventoryTxn *and* applied to the quantity in one
 * transaction. A quantity without the movement that caused it is a number nobody can
 * check, and a movement that did not change the quantity is a lie in the register.
 */

export async function saveItem(input: {
  itemId?: string | null;
  name: string;
  group?: string | null;
  unit: string;
  reorderAt?: number | null;
  unitPriceText?: string | null;
  supplier?: string | null;
  openingQuantity?: number | null;
}) {
  const actor = await requireRole(...OFFICE);

  const price = input.unitPriceText?.trim() ? paiseFromText(input.unitPriceText) : null;
  if (input.unitPriceText?.trim() && price == null) return { error: "That price is not an amount." };

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
    return { error: check.messages.find((m) => m.level === "ERROR")!.message, messages: check.messages };
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
    if (!existing) return { error: "That item is not in the store." };

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
    revalidatePath("/app/stock");
    return { ok: true as const, messages: check.messages };
  }

  const opening = input.openingQuantity ?? 0;
  if (!Number.isInteger(opening) || opening < 0) return { error: "An opening quantity cannot be negative." };

  await db.$transaction(async (tx) => {
    const made = await tx.inventoryItem.create({
      data: { schoolId: actor.schoolId, ...data, quantity: opening },
      select: { id: true },
    });
    // Even the opening balance gets a movement, so the register explains every unit
    // on the shelf rather than starting with an unexplained number.
    if (opening > 0) {
      await tx.inventoryTxn.create({
        data: {
          schoolId: actor.schoolId,
          itemId: made.id,
          kind: "IN",
          quantity: opening,
          reason: "Opening stock",
          date: schoolToday(),
        },
      });
    }
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.stock.item.create",
    entity: "InventoryItem",
    entityId: actor.schoolId,
    summary: `Added ${name} to the store${opening > 0 ? `, opening stock ${opening} ${data.unit}` : ""}`,
  });

  revalidatePath("/app/stock");
  return { ok: true as const, messages: check.messages };
}

/**
 * An asset the school owns: a projector, a bus, a water cooler. Unlike the store
 * cupboard there is no quantity to reconcile, only the facts that go stale — an AMC
 * that lapsed, an insurance policy nobody renewed, a condition nobody updated after
 * the thing broke.
 */
export async function saveAsset(input: {
  assetId?: string | null;
  name: string;
  tag?: string | null;
  location?: string | null;
  supplier?: string | null;
  purchaseDateIso?: string | null;
  costText?: string | null;
  amcVendor?: string | null;
  amcExpiryIso?: string | null;
  insuranceExpiryIso?: string | null;
  condition?: string | null;
}) {
  const actor = await requireRole(...OFFICE);

  const name = input.name.trim();
  if (!name) return { error: "An asset needs a name." };

  const cost = input.costText?.trim() ? paiseFromText(input.costText) : null;
  if (input.costText?.trim() && cost == null) return { error: "That cost is not an amount." };

  const data = {
    name,
    tag: input.tag?.trim() || null,
    location: input.location?.trim() || null,
    supplier: input.supplier?.trim() || null,
    purchaseDate: input.purchaseDateIso ? new Date(`${input.purchaseDateIso}T00:00:00.000Z`) : null,
    cost,
    amcVendor: input.amcVendor?.trim() || null,
    amcExpiry: input.amcExpiryIso ? new Date(`${input.amcExpiryIso}T00:00:00.000Z`) : null,
    insuranceExpiry: input.insuranceExpiryIso ? new Date(`${input.insuranceExpiryIso}T00:00:00.000Z`) : null,
    condition: input.condition?.trim() || "GOOD",
  };

  if (input.assetId) {
    const existing = await db.asset.findFirst({
      where: { id: input.assetId, schoolId: actor.schoolId },
      select: { id: true, name: true, condition: true },
    });
    if (!existing) return { error: "That asset is not on record." };

    await db.asset.update({ where: { id: existing.id }, data });
    await audit({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: "school.stock.asset.update",
      entity: "Asset",
      entityId: existing.id,
      summary: `Changed the asset ${existing.name}${name !== existing.name ? ` to ${name}` : ""}`,
      before: { name: existing.name, condition: existing.condition },
      after: { name: data.name, condition: data.condition },
      reversible: true,
    });
    revalidatePath("/app/stock");
    return { ok: true as const };
  }

  const made = await db.asset.create({
    data: { schoolId: actor.schoolId, ...data },
    select: { id: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.stock.asset.create",
    entity: "Asset",
    entityId: made.id,
    summary: `Added the asset ${name}${data.tag ? ` (${data.tag})` : ""} to the register`,
  });

  revalidatePath("/app/stock");
  return { ok: true as const };
}

/**
 * Writing off an asset is not deleting it — the record stays so the register still
 * explains where the projector went. `condition` already distinguishes GOOD from
 * NEEDS_REPAIR; CONDEMNED is the same field's way of saying "gone".
 */
export async function disposeAsset(assetId: string, reason: string) {
  const actor = await requireRole(...OFFICE);

  if (!reason.trim()) return { error: "Say why the asset is being written off." };

  const asset = await db.asset.findFirst({
    where: { id: assetId, schoolId: actor.schoolId },
    select: { id: true, name: true, condition: true },
  });
  if (!asset) return { error: "That asset is not on record." };
  if (asset.condition === "CONDEMNED") return { error: "That asset is already written off." };

  await db.asset.update({ where: { id: asset.id }, data: { condition: "CONDEMNED" } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.stock.asset.dispose",
    entity: "Asset",
    entityId: asset.id,
    summary: `Wrote off the asset ${asset.name}: ${reason.trim()}`,
    before: { condition: asset.condition },
    after: { condition: "CONDEMNED" },
    reversible: true,
  });

  revalidatePath("/app/stock");
  return { ok: true as const };
}

/**
 * A delivery in, an issue out, or a correction after counting the shelf.
 *
 * `applyStockTxn` decides; this only writes what it decided. Issuing more than the
 * cupboard holds is refused with the number that is actually there, because a
 * register showing minus four dusters has stopped being a record of anything.
 */
export async function recordMovement(input: {
  itemId: string;
  kind: "IN" | "OUT" | "ADJUST";
  quantity: number;
  reason?: string | null;
  billNo?: string | null;
  dateIso?: string | null;
}) {
  const actor = await requireRole(...OFFICE);

  const item = await db.inventoryItem.findFirst({
    where: { id: input.itemId, schoolId: actor.schoolId },
    select: { id: true, name: true, unit: true, quantity: true },
  });
  if (!item) return { error: "That item is not in the store." };

  const applied = applyStockTxn({ kind: input.kind, quantity: input.quantity, current: item.quantity });
  if (!applied.allowed) return { error: applied.reason! };

  if (input.kind === "ADJUST" && !input.reason?.trim()) {
    // A correction with no reason is indistinguishable from a mistake, and it is the
    // one movement that can make stock appear or vanish.
    return { error: "Say why the count is being corrected — that is the whole value of a correction." };
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

  revalidatePath("/app/stock");
  return { ok: true as const, quantity: applied.next };
}
