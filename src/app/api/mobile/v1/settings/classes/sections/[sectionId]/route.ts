import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { deleteSectionForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ sectionId: string }> };

/** Mirrors src/app/app/settings/classes/actions.ts::deleteSection. */
export const DELETE = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { sectionId } = await params;

  const result = await deleteSectionForActor(actor, { sectionId });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ deleted: true });
});
