import { requireMobileRole, hasRole, OFFICE, TEACHING } from "@/lib/mobile/session";
import { getReportCardScope, getTermDetail } from "@/lib/queries/exams";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ termName: string }> };

/** The classes within one cycle, scoped to report-card ownership (class teacher only). Mirrors /exams/terms/[termName] but for ReportCardClassesScreen instead of ExamTermDetailScreen. */
export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const { termName: raw } = await params;
  const termName = decodeURIComponent(raw);

  const isOffice = hasRole(actor, ...OFFICE);
  const scope = await getReportCardScope(actor, isOffice);
  const term = await getTermDetail(actor.schoolId, termName, scope);
  if (!term) return apiError(404, "not_found", "No such exam term.");
  return apiOk({ term });
});
