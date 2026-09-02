import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { saveStopForActor } from "@/lib/mobile/mutations/transport";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ routeId: string }> };

const Body = z.object({
  stopId: z.string().min(1).optional().nullable(),
  name: z.string().min(1),
  monthlyFeeText: z.string().optional().nullable(),
  pickupTime: z.string().optional().nullable(),
  dropTime: z.string().optional().nullable(),
});

/**
 * A stop, and what it costs a month. Mirrors
 * src/app/app/transport/actions.ts::saveStop — creates or updates depending
 * on stopId.
 */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { routeId } = await params;
  const input = Body.parse(await req.json());

  const result = await saveStopForActor(actor, { routeId, ...input });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ stopId: result.stopId }, input.stopId ? 200 : 201);
});
