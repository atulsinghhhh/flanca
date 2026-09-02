import { z } from "zod";
import { getStockItems } from "@/lib/queries/stock";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { saveItemForActor } from "@/lib/mobile/mutations/stock";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Items with current stock levels. Mirrors src/app/app/stock/page.tsx's store table. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const items = await getStockItems(actor.schoolId);
  return apiOk({ items });
});

const Body = z.object({
  itemId: z.string().min(1).optional().nullable(),
  name: z.string().min(1),
  group: z.string().optional().nullable(),
  unit: z.string().min(1),
  reorderAt: z.number().int().optional().nullable(),
  unitPriceText: z.string().optional().nullable(),
  supplier: z.string().optional().nullable(),
  openingQuantity: z.number().int().optional().nullable(),
});

/** Mirrors src/app/app/stock/actions.ts::saveItem — creates or updates depending on itemId. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await saveItemForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ itemId: result.itemId, messages: result.messages }, input.itemId ? 200 : 201);
});
