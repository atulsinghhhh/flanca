import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { deleteAcademicYearForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ yearId: string }> };

/**
 * Mirrors src/app/app/settings/year/actions.ts::deleteAcademicYear. A year
 * whose deletion also removes a fee structure/exam terms comes back as a
 * 409 confirmation_required the first time; resend with ?confirm=true once
 * the caller has shown that sentence to the user (a query flag rather than a
 * DELETE body, which nothing else in this API relies on).
 */
export const DELETE = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { yearId } = await params;
  const confirm = new URL(req.url).searchParams.get("confirm") === "true";

  const result = await deleteAcademicYearForActor(actor, { yearId, confirm });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ deleted: true });
});
