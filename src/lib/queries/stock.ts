import { db } from "@/lib/db";
import { needsReorder } from "@/lib/core/operations-core";

export type StockItemRow = {
  id: string;
  name: string;
  group: string | null;
  unit: string;
  quantity: number;
  reorderAt: number | null;
  unitPrice: number | null;
  supplier: string | null;
  lowStock: boolean;
};

/**
 * The store cupboard's item list with current stock levels — the mobile twin
 * of src/app/app/stock/page.tsx's item table (same fields, same `needsReorder`
 * guard from core rather than re-typed here). Recent movements and assets are
 * that page's other two panels and are not exposed here; a movement is
 * written, not browsed, from a phone.
 */
export async function getStockItems(schoolId: string): Promise<StockItemRow[]> {
  const items = await db.inventoryItem.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
  });

  return items.map((i) => ({
    id: i.id,
    name: i.name,
    group: i.group,
    unit: i.unit,
    quantity: i.quantity,
    reorderAt: i.reorderAt,
    unitPrice: i.unitPrice,
    supplier: i.supplier,
    lowStock: needsReorder(i),
  }));
}
