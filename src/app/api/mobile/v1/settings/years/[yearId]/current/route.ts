import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { setCurrentYearForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ yearId: string }> };

/** Mirrors src/app/app/settings/year/actions.ts::setCurrentYear. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { yearId } = await params;

  const result = await setCurrentYearForActor(actor, { yearId });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ updated: true });
});
