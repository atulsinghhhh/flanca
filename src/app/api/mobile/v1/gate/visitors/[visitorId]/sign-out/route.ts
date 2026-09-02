import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { signVisitorOutForActor } from "@/lib/mobile/mutations/gate";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ visitorId: string }> };

/** Mirrors src/app/app/gate/actions.ts::signVisitorOut. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { visitorId } = await params;

  const result = await signVisitorOutForActor(actor, visitorId);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ signedOut: true });
});
