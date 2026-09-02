import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { unboardStudentForActor } from "@/lib/mobile/mutations/transport";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ studentTransportId: string }> };

/** Mirrors src/app/app/transport/actions.ts::unboardStudent. */
export const DELETE = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { studentTransportId } = await params;

  const result = await unboardStudentForActor(actor, studentTransportId);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ deleted: true });
});
