import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";
import { getAcademicYearOverview } from "@/lib/queries/year-overview";

type RouteCtx = { params: Promise<{ yearId: string }> };

/** The whole-year plan for one academic year — exam terms, PTM days, calendar events. */
export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { yearId } = await params;

  const overview = await getAcademicYearOverview(actor.schoolId, yearId);
  if (!overview) return apiError(404, "not_found", "That academic year is not in this school.");

  return apiOk(overview);
});
