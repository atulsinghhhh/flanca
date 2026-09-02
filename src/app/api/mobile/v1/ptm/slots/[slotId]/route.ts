import { requireMobileRole, TEACHING } from "@/lib/mobile/session";
import { removeSlotForActor } from "@/lib/mobile/mutations/ptm";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ slotId: string }> };

/** Mirrors src/app/app/ptm/actions.ts::removeSlot. */
export const DELETE = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const { slotId } = await params;

  const result = await removeSlotForActor(actor, { slotId });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ removed: true });
});
