import { z } from "zod";
import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { moveFeeHeadForActor } from "@/lib/mobile/mutations/fee-structures";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ feeHeadId: string }> };

const Body = z.object({ direction: z.enum(["UP", "DOWN"]) });

/** Mirrors moveFeeHead — the order heads appear in on the grid, and on the parent's invoice. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const { feeHeadId } = await params;
  const { direction } = Body.parse(await req.json());

  const result = await moveFeeHeadForActor(actor, { feeHeadId, direction });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ moved: true });
});
