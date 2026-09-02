import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { approveConcessionForActor } from "@/lib/mobile/mutations/fee-concessions";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Mirrors approveConcession — OFFICE, not MONEY. An accountant records what a
 * family asks for; somebody senior decides what the school gives away.
 */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { id } = await params;

  const result = await approveConcessionForActor(actor, { concessionId: id });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ approved: true });
});
