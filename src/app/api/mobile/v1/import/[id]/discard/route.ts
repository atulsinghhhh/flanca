import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { discardImportForActor } from "@/lib/mobile/mutations/import";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

/** Cancel a validated-but-not-yet-applied batch. Mirrors discardImport. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { id } = await params;

  const result = await discardImportForActor(actor, id);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk(result);
});
