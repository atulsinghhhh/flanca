import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { deleteRoomForActor } from "@/lib/mobile/mutations/hostel";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ roomId: string }> };

/** Mirrors src/app/app/hostel/actions.ts::deleteRoom — blocked if the room has ever held an allotment. */
export const DELETE = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { roomId } = await params;

  const result = await deleteRoomForActor(actor, roomId);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ deleted: true });
});
