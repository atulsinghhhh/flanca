import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { recordMovementForActor } from "@/lib/mobile/mutations/stock";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ itemId: string }> };

const Body = z.object({
  kind: z.enum(["IN", "OUT", "ADJUST"]),
  quantity: z.number().int(),
  reason: z.string().optional().nullable(),
  billNo: z.string().optional().nullable(),
  dateIso: z.string().optional().nullable(),
});

/**
 * A delivery in, an issue out, or a correction after counting the shelf.
 * Mirrors src/app/app/stock/actions.ts::recordMovement.
 */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { itemId } = await params;
  const input = Body.parse(await req.json());

  const result = await recordMovementForActor(actor, { itemId, ...input });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ quantity: result.quantity }, 201);
});
