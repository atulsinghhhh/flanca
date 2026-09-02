import { requireMobileActor } from "@/lib/mobile/session";
import { cancelBookingForActor } from "@/lib/mobile/mutations/ptm";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ slotId: string }> };

/**
 * Mirrors src/app/app/ptm/actions.ts::cancelBooking — no role gate at the
 * route level, since the parent who booked, the teacher whose slot it is, or
 * the office may all cancel; canCancelBooking (ptm-core) is the real guard.
 */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileActor(req);
  const { slotId } = await params;

  const result = await cancelBookingForActor(actor, { slotId });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ cancelled: true });
});
