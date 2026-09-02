import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { resetLoginForActor } from "@/lib/mobile/mutations/students";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ studentId: string }> };

/** Mirrors src/app/app/students/logins/actions.ts::resetLogin. The code is returned here, once, and never again. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { studentId } = await params;

  const result = await resetLoginForActor(actor, studentId);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ slip: result.slip });
});
