"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Check,
  Loader2,
  Plus,
  Scale,
} from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/components/ui/primitives";
import { applyStockTxn, needsReorder, validateItem } from "@/lib/core/operations-core";
import { recordMovement, saveAsset, saveItem } from "./actions";

export type ItemRow = {
  id: string;
  name: string;
  group: string | null;
  unit: string;
  quantity: number;
  reorderAt: number | null;
  unitPriceRupees: string;
  supplier: string | null;
};

export type AssetRow = {
  id: string;
  name: string;
  tag: string | null;
  location: string | null;
  supplier: string | null;
  purchaseDateIso: string | null;
  costRupees: string;
  amcVendor: string | null;
  amcExpiryIso: string | null;
  insuranceExpiryIso: string | null;
  condition: string | null;
};

const INPUT = "h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

const EMPTY_ITEM_FORM = { name: "", group: "", unit: "pcs", reorderAt: "", price: "", supplier: "", opening: "" };
const EMPTY_ASSET_FORM = {
  name: "",
  tag: "",
  location: "",
  supplier: "",
  purchaseDate: "",
  cost: "",
  amcVendor: "",
  amcExpiry: "",
  insuranceExpiry: "",
  condition: "GOOD",
};

/**
 * The store cupboard, as a storekeeper uses it: mostly receiving and issuing, and
 * occasionally admitting that the shelf and the register disagree. It also holds the
 * asset register — a projector, a bus, a water cooler — whose facts go stale rather
 * than run out.
 */
export function StockEditor({
  items,
  assets,
  editItemId,
  editAssetId,
}: {
  items: ItemRow[];
  assets: AssetRow[];
  editItemId?: string | null;
  editAssetId?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [mode, setMode] = useState<"MOVE" | "ITEM" | "ASSET" | null>(null);

  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [kind, setKind] = useState<"IN" | "OUT" | "ADJUST">("IN");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [billNo, setBillNo] = useState("");

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_ITEM_FORM);

  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [assetForm, setAssetForm] = useState(EMPTY_ASSET_FORM);

  useEffect(() => {
    if (!editItemId) return;
    const found = items.find((i) => i.id === editItemId);
    if (!found) return;
    setEditingItemId(found.id);
    setForm({
      name: found.name,
      group: found.group ?? "",
      unit: found.unit,
      reorderAt: found.reorderAt != null ? String(found.reorderAt) : "",
      price: found.unitPriceRupees,
      supplier: found.supplier ?? "",
      opening: "",
    });
    setMode("ITEM");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItemId]);

  useEffect(() => {
    if (!editAssetId) return;
    const found = assets.find((a) => a.id === editAssetId);
    if (!found) return;
    setEditingAssetId(found.id);
    setAssetForm({
      name: found.name,
      tag: found.tag ?? "",
      location: found.location ?? "",
      supplier: found.supplier ?? "",
      purchaseDate: found.purchaseDateIso ?? "",
      cost: found.costRupees,
      amcVendor: found.amcVendor ?? "",
      amcExpiry: found.amcExpiryIso ?? "",
      insuranceExpiry: found.insuranceExpiryIso ?? "",
      condition: found.condition ?? "GOOD",
    });
    setMode("ASSET");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editAssetId]);

  const item = items.find((i) => i.id === itemId);
  const quantity = Number(qty);
  const applied = item
    ? applyStockTxn({ kind, quantity: Number.isFinite(quantity) ? quantity : 0, current: item.quantity })
    : null;

  const liveItem = validateItem({
    name: form.name,
    unit: form.unit,
    reorderAt: form.reorderAt.trim() === "" ? null : Number(form.reorderAt),
    existingNames: items.filter((i) => i.id !== editingItemId).map((i) => i.name),
  });

  function run(fn: () => Promise<{ error?: string } | undefined>, after?: () => void) {
    setError(null);
    setNote(null);
    start(async () => {
      const r = (await fn()) ?? {};
      if (r.error) {
        setError(r.error);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  function closeItemForm() {
    setMode(null);
    setEditingItemId(null);
    setForm(EMPTY_ITEM_FORM);
    if (editItemId) router.replace("/app/stock");
  }

  function closeAssetForm() {
    setMode(null);
    setEditingAssetId(null);
    setAssetForm(EMPTY_ASSET_FORM);
    if (editAssetId) router.replace("/app/stock");
  }

  function openNewItemForm() {
    setEditingItemId(null);
    setForm(EMPTY_ITEM_FORM);
    setMode("ITEM");
  }

  function openNewAssetForm() {
    setEditingAssetId(null);
    setAssetForm(EMPTY_ASSET_FORM);
    setMode("ASSET");
  }

  const low = items.filter(needsReorder);

  return (
    <Card id="stock-editor" className="mt-5">
      <CardHead
        title="Move stock"
        hint="Every movement is written down and applied to the count in one go, so the number on this screen is always the number on the shelf."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode(mode === "MOVE" ? null : "MOVE")}
              disabled={items.length === 0}
              className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand disabled:opacity-40"
            >
              <Scale className="size-3.5" /> Movement
            </button>
            <button
              onClick={() => (mode === "ITEM" ? closeItemForm() : openNewItemForm())}
              className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand"
            >
              <Plus className="size-3.5" /> New item
            </button>
            <button
              onClick={() => (mode === "ASSET" ? closeAssetForm() : openNewAssetForm())}
              className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand"
            >
              <Boxes className="size-3.5" /> New asset
            </button>
          </div>
        }
      />

      {error ? (
        <p className="mx-5 mt-4 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13.5px] text-overdue">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="mx-5 mt-4 rounded-md border border-good/25 bg-good-light px-3 py-2 text-[13.5px] font-medium text-good">
          {note}
        </p>
      ) : null}

      {mode === "MOVE" ? (
        <div className="border-b border-line px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="lg:col-span-2">
              <span className="mb-1.5 block text-[13px] font-semibold">Item</span>
              <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={INPUT}>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} — {i.quantity} {i.unit}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">What happened</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as "IN" | "OUT" | "ADJUST")} className={INPUT}>
                <option value="IN">Received</option>
                <option value="OUT">Issued</option>
                <option value="ADJUST">Counted the shelf</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">
                {kind === "ADJUST" ? "Actually there" : "How many"}
              </span>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className={INPUT}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">
                {kind === "IN" ? "Bill number" : kind === "ADJUST" ? "Why" : "Issued to"}
              </span>
              <input
                value={kind === "IN" ? billNo : reason}
                onChange={(e) => (kind === "IN" ? setBillNo(e.target.value) : setReason(e.target.value))}
                placeholder={kind === "IN" ? "INV-2291" : kind === "OUT" ? "Class 6 A" : "Two boxes damaged by damp"}
                className={INPUT}
              />
            </label>
          </div>

          {item && qty.trim() !== "" ? (
            <p className={`mt-2.5 text-[12.5px] ${applied?.allowed ? "text-ink-2" : "text-overdue"}`}>
              {applied?.allowed
                ? `${item.name}: ${item.quantity} → ${applied.next} ${item.unit}.`
                : applied?.reason}
            </p>
          ) : null}

          <div className="mt-3 flex items-center gap-3">
            <Button
              size="sm"
              disabled={pending || !item || qty.trim() === "" || !applied?.allowed}
              onClick={() =>
                run(
                  () =>
                    recordMovement({
                      itemId,
                      kind,
                      quantity: Number(qty),
                      reason: kind === "IN" ? null : reason,
                      billNo: kind === "IN" ? billNo : null,
                    }),
                  () => {
                    setNote(
                      kind === "ADJUST"
                        ? `${item?.name} corrected to ${qty} ${item?.unit}.`
                        : `${kind === "IN" ? "Received" : "Issued"} ${qty} ${item?.unit} of ${item?.name}.`,
                    );
                    setQty("");
                    setReason("");
                    setBillNo("");
                  },
                )
              }
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : kind === "IN" ? (
                <ArrowDownToLine className="size-4" />
              ) : kind === "OUT" ? (
                <ArrowUpFromLine className="size-4" />
              ) : (
                <Scale className="size-4" />
              )}
              Record it
            </Button>
            <button onClick={() => setMode(null)} className="text-[13px] font-semibold text-ink-3">
              Done
            </button>
          </div>
        </div>
      ) : null}

      {mode === "ITEM" ? (
        <div className="border-b border-line px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Chalk, dustless" className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Counted in</span>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="boxes" className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Group</span>
              <select value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} className={INPUT}>
                <option value="">None</option>
                <option value="STATIONERY">Stationery</option>
                <option value="UNIFORM">Uniform</option>
                <option value="LAB">Lab</option>
                <option value="SPORTS">Sports</option>
                <option value="HOUSEKEEPING">Housekeeping</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Tell me when it drops to</span>
              <input
                value={form.reorderAt}
                onChange={(e) => setForm({ ...form, reorderAt: e.target.value.replace(/\D/g, "") })}
                inputMode="numeric"
                placeholder="10"
                className={INPUT}
              />
            </label>
            {!editingItemId ? (
              <label>
                <span className="mb-1.5 block text-[13px] font-semibold">Opening stock</span>
                <input
                  value={form.opening}
                  onChange={(e) => setForm({ ...form, opening: e.target.value.replace(/\D/g, "") })}
                  inputMode="numeric"
                  placeholder="0"
                  className={INPUT}
                />
              </label>
            ) : null}
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Price each</span>
              <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} inputMode="decimal" placeholder="45" className={INPUT} />
            </label>
            <label className="lg:col-span-2">
              <span className="mb-1.5 block text-[13px] font-semibold">Supplier</span>
              <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className={INPUT} />
            </label>
          </div>

          {liveItem.messages.length > 0 ? (
            <ul className="mt-2.5 space-y-1">
              {liveItem.messages.map((m, i) => (
                <li key={i} className={`text-[12.5px] ${m.level === "ERROR" ? "text-overdue" : "text-marigold"}`}>
                  {m.message}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3 flex items-center gap-3">
            <Button
              size="sm"
              disabled={pending || !liveItem.ok}
              onClick={() =>
                run(
                  () =>
                    saveItem({
                      itemId: editingItemId,
                      name: form.name,
                      group: form.group || null,
                      unit: form.unit,
                      reorderAt: form.reorderAt.trim() === "" ? null : Number(form.reorderAt),
                      unitPriceText: form.price || null,
                      supplier: form.supplier || null,
                      openingQuantity: form.opening.trim() === "" ? 0 : Number(form.opening),
                    }),
                  () => {
                    setNote(editingItemId ? `${form.name.trim()} updated.` : `${form.name.trim()} added to the store.`);
                    closeItemForm();
                  },
                )
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {editingItemId ? "Save item" : "Add item"}
            </Button>
            <button onClick={closeItemForm} className="text-[13px] font-semibold text-ink-3">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {mode === "ASSET" ? (
        <div className="border-b border-line px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Name</span>
              <input value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} placeholder="Projector, room 4" className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Asset tag</span>
              <input value={assetForm.tag} onChange={(e) => setAssetForm({ ...assetForm, tag: e.target.value })} placeholder="AST-0142" className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Location</span>
              <input value={assetForm.location} onChange={(e) => setAssetForm({ ...assetForm, location: e.target.value })} className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Condition</span>
              <select value={assetForm.condition} onChange={(e) => setAssetForm({ ...assetForm, condition: e.target.value })} className={INPUT}>
                <option value="GOOD">Good</option>
                <option value="NEEDS_REPAIR">Needs repair</option>
                <option value="CONDEMNED">Condemned / written off</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Purchase date</span>
              <input type="date" value={assetForm.purchaseDate} onChange={(e) => setAssetForm({ ...assetForm, purchaseDate: e.target.value })} className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Cost</span>
              <input value={assetForm.cost} onChange={(e) => setAssetForm({ ...assetForm, cost: e.target.value })} inputMode="decimal" placeholder="45000" className={INPUT} />
            </label>
            <label className="lg:col-span-2">
              <span className="mb-1.5 block text-[13px] font-semibold">Supplier</span>
              <input value={assetForm.supplier} onChange={(e) => setAssetForm({ ...assetForm, supplier: e.target.value })} className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">AMC vendor</span>
              <input value={assetForm.amcVendor} onChange={(e) => setAssetForm({ ...assetForm, amcVendor: e.target.value })} className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">AMC expiry</span>
              <input type="date" value={assetForm.amcExpiry} onChange={(e) => setAssetForm({ ...assetForm, amcExpiry: e.target.value })} className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Insurance expiry</span>
              <input type="date" value={assetForm.insuranceExpiry} onChange={(e) => setAssetForm({ ...assetForm, insuranceExpiry: e.target.value })} className={INPUT} />
            </label>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <Button
              size="sm"
              disabled={pending || !assetForm.name.trim()}
              onClick={() =>
                run(
                  () =>
                    saveAsset({
                      assetId: editingAssetId,
                      name: assetForm.name,
                      tag: assetForm.tag || null,
                      location: assetForm.location || null,
                      supplier: assetForm.supplier || null,
                      purchaseDateIso: assetForm.purchaseDate || null,
                      costText: assetForm.cost || null,
                      amcVendor: assetForm.amcVendor || null,
                      amcExpiryIso: assetForm.amcExpiry || null,
                      insuranceExpiryIso: assetForm.insuranceExpiry || null,
                      condition: assetForm.condition || null,
                    }),
                  () => {
                    setNote(editingAssetId ? `${assetForm.name.trim()} updated.` : `${assetForm.name.trim()} added to the register.`);
                    closeAssetForm();
                  },
                )
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {editingAssetId ? "Save asset" : "Add asset"}
            </Button>
            <button onClick={closeAssetForm} className="text-[13px] font-semibold text-ink-3">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {low.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <span className="text-[12.5px] font-semibold text-marigold">Running low:</span>
          {low.map((i) => (
            <Badge key={i.id} tone="warn">
              {i.name} — {i.quantity} {i.unit}
            </Badge>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
