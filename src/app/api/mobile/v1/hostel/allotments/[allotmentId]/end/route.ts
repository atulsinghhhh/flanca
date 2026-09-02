import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { endAllotmentForActor } from "@/lib/mobile/mutations/hostel";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ allotmentId: string }> };

/** Mirrors src/app/app/hostel/actions.ts::endAllotment — a child leaving the hostel; the bed frees up. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { allotmentId } = await params;

  const result = await endAllotmentForActor(actor, allotmentId);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ ok: true });
});
