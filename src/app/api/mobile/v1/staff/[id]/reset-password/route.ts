import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { resetStaffPasswordForActor } from "@/lib/mobile/mutations/staff";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

/** Mirrors src/app/app/staff/people-actions.ts::resetStaffPassword. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { id } = await params;

  const result = await resetStaffPasswordForActor(actor, { staffId: id });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ firstPassword: result.firstPassword });
});
