import { requireMobileRole } from "@/lib/mobile/session";
import { LIBRARY_ROLES, returnBookForActor } from "@/lib/mobile/mutations/library";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ issueId: string }> };

/** Mirrors src/app/app/library/actions.ts::returnBook — a book handed back at the desk. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...LIBRARY_ROLES);
  const { issueId } = await params;

  const result = await returnBookForActor(actor, issueId);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ fine: result.fine });
});
