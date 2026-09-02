import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { adoptAadhaarNameForActor } from "@/lib/mobile/mutations/apaar";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ studentId: string }> };

/** Mirrors src/app/app/apaar/actions.ts::adoptAadhaarName. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { studentId } = await params;

  const result = await adoptAadhaarNameForActor(actor, studentId);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ ok: true });
});
