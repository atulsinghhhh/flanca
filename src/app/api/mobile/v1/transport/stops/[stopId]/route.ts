import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { deleteStopForActor } from "@/lib/mobile/mutations/transport";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ stopId: string }> };

/** Mirrors src/app/app/transport/actions.ts::deleteStop — blocked if anyone is picked up there. */
export const DELETE = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { stopId } = await params;

  const result = await deleteStopForActor(actor, stopId);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ deleted: true });
});
