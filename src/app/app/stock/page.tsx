import Link from "next/link";
import { AlertTriangle, Package, Pencil, ShieldAlert, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { needsReorder } from "@/lib/core/operations-core";
import { formatMoney } from "@/lib/core/money";
import { Badge, Card, CardHead, Empty, PageHead, Stat } from "@/components/ui/primitives";
import { StockEditor } from "./stock-editor";
import type { AssetRow, ItemRow } from "./stock-editor";
import { DisposeAssetButton } from "./asset-row-actions";

export const metadata = { title: "Stock & assets — Flanca" };

const DATE = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const ISO = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

const RUPEES_TEXT = (p: number | null | undefined) => (p == null ? "" : String(p / 100));

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ editItem?: string; editAsset?: string }>;
}) {
  const actor = await requireRole(...OFFICE);
  const { editItem, editAsset } = await searchParams;
  const today = new Date();
  const soon = new Date(today.getTime() + 60 * 86_400_000);

  const [items, assets, recentTxns] = await Promise.all([
    db.inventoryItem.findMany({ where: { schoolId: actor.schoolId }, orderBy: { name: "asc" } }),
    db.asset.findMany({ where: { schoolId: actor.schoolId }, orderBy: { name: "asc" } }),
    db.inventoryTxn.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { date: "desc" },
      take: 10,
      include: { item: { select: { name: true } } },
    }),
  ]);

  // The same rule the storekeeper's list uses, from core rather than re-typed here.
  const lowStock = items.filter((i) => needsReorder(i));
  const stockValue = items.reduce((a, i) => a + i.quantity * (i.unitPrice ?? 0), 0);
  const amcExpiring = assets.filter((a) => a.amcExpiry && a.amcExpiry <= soon);
  const needsRepair = assets.filter((a) => a.condition === "NEEDS_REPAIR");

  return (
    <>
      <PageHead
        eyebrow="School"
        title="Stock & assets"
        sub="What is in the store, what needs reordering, and which AMC is about to lapse."
      />

      <StockEditor
        items={items.map<ItemRow>((i) => ({
          id: i.id,
          name: i.name,
          group: i.group,
          unit: i.unit,
          quantity: i.quantity,
          reorderAt: i.reorderAt,
          unitPriceRupees: RUPEES_TEXT(i.unitPrice),
          supplier: i.supplier,
        }))}
        assets={assets.map<AssetRow>((a) => ({
          id: a.id,
          name: a.name,
          tag: a.tag,
          location: a.location,
          supplier: a.supplier,
          purchaseDateIso: ISO(a.purchaseDate),
          costRupees: RUPEES_TEXT(a.cost),
          amcVendor: a.amcVendor,
          amcExpiryIso: ISO(a.amcExpiry),
          insuranceExpiryIso: ISO(a.insuranceExpiry),
          condition: a.condition,
        }))}
        editItemId={editItem}
        editAssetId={editAsset}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Stock value" value={formatMoney(stockValue)} sub={`${items.length} items`} icon={<Package className="size-4" />} />
        <Stat
          label="Below reorder level"
          value={lowStock.length}
          tone={lowStock.length > 0 ? "warn" : "good"}
          sub="order these"
          icon={<AlertTriangle className="size-4" />}
        />
        <Stat
          label="AMC expiring"
          value={amcExpiring.length}
          tone={amcExpiring.length > 0 ? "warn" : "good"}
          sub="within 60 days"
          icon={<ShieldAlert className="size-4" />}
        />
        <Stat
          label="Needs repair"
          value={needsRepair.length}
          tone={needsRepair.length > 0 ? "bad" : "good"}
          icon={<Wrench className="size-4" />}
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHead title="Store" hint="Items below their reorder level are highlighted" />
          {items.length === 0 ? (
            <Empty title="Nothing in the store" />
          ) : (
            <div className="overflow-x-auto">
              <table className="ruled w-full min-w-[520px]">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Group</th>
                    <th className="num">In stock</th>
                    <th className="num">Reorder at</th>
                    <th className="num">Value</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const low = i.reorderAt != null && i.quantity <= i.reorderAt;
                    return (
                      <tr key={i.id} className={low ? "bg-marigold-light/40" : undefined}>
                        <td data-title className="font-medium">{i.name}</td>
                        <td data-label="Group" className="text-[12.5px] text-ink-3">{i.group ?? "—"}</td>
                        <td data-label="In stock" className={`num ${low ? "font-semibold text-marigold-ink" : ""}`}>
                          {i.quantity} {i.unit}
                        </td>
                        <td data-label="Reorder at" className="num text-ink-3">{i.reorderAt ?? "—"}</td>
                        <td data-label="Value" className="num text-ink-2">
                          {i.unitPrice ? formatMoney(i.quantity * i.unitPrice) : "—"}
                        </td>
                        <td className="num">
                          <Link
                            href={`/app/stock?editItem=${i.id}#stock-editor`}
                            className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-3 hover:text-brand"
                          >
                            <Pencil className="size-3.5" /> Edit
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHead title="Assets" hint="AMC and insurance dates the office forgets" />
            {assets.length === 0 ? (
              <Empty title="No assets recorded" />
            ) : (
              <ul className="divide-y divide-line">
                {assets.map((a) => {
                  const expiring = a.amcExpiry && a.amcExpiry <= soon;
                  const disposed = a.condition === "CONDEMNED";
                  return (
                    <li key={a.id} className="px-5 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium">{a.name}</p>
                          <p className="text-[11.5px] text-ink-3">
                            {a.tag ?? "—"}
                            {a.location ? ` · ${a.location}` : ""}
                            {a.cost ? ` · ${formatMoney(a.cost)}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {disposed ? (
                            <Badge tone="neutral">Written off</Badge>
                          ) : a.condition === "NEEDS_REPAIR" ? (
                            <Badge tone="bad">Needs repair</Badge>
                          ) : (
                            <Badge tone="good">Good</Badge>
                          )}
                          <p className={`mt-1 text-[11px] ${expiring ? "font-semibold text-overdue" : "text-ink-3"}`}>
                            AMC {DATE(a.amcExpiry)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <Link
                          href={`/app/stock?editAsset=${a.id}#stock-editor`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-3 hover:text-brand"
                        >
                          <Pencil className="size-3" /> Edit
                        </Link>
                        {!disposed ? <DisposeAssetButton assetId={a.id} assetName={a.name} /> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead title="Recent stock movement" />
            {recentTxns.length === 0 ? (
              <Empty title="No movement recorded" />
            ) : (
              <ul className="divide-y divide-line">
                {recentTxns.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{t.item.name}</p>
                      <p className="text-[11.5px] text-ink-3">
                        {DATE(t.date)}
                        {t.reason ? ` · ${t.reason}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[13px] font-semibold tnum ${
                        t.kind === "IN" ? "text-good" : "text-overdue"
                      }`}
                    >
                      {t.kind === "IN" ? "+" : "−"}
                      {t.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
