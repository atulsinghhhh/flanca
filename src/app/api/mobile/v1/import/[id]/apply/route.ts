import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { applyImportForActor } from "@/lib/mobile/mutations/import";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Step 2 — apply. Requires MONEY at the route (the broader of the two roles
 * this can need) — applyImportForActor rejects an ACCOUNTANT trying to apply
 * a STUDENTS/STAFF batch, since those need OFFICE specifically.
 */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const { id } = await params;

  const result = await applyImportForActor(actor, id);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk(result);
});
