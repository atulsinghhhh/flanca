import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { revertImportForActor } from "@/lib/mobile/mutations/import";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

/** Step 3 — undo. Same broad-role-at-the-route, fine-grained-inside pattern as apply. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const { id } = await params;

  const result = await revertImportForActor(actor, id);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk(result);
});
