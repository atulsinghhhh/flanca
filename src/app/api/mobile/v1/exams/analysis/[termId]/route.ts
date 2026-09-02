import { getResultAnalysis } from "@/lib/queries/exams";
import { isClassTeacherOf } from "@/lib/mobile/mutations/exams";
import { requireMobileRole, TEACHING, hasRole, OFFICE } from "@/lib/mobile/session";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ termId: string }> };

/** Mirrors src/app/app/report-cards/page.tsx's class result analysis (not
 * the generate-a-card action — that stays office-only bulk work). A class
 * teacher may see how their own class did; office sees any class. */
export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const { termId } = await params;

  const analysis = await getResultAnalysis(actor.schoolId, termId);
  if (!analysis) return apiError(404, "not_found", "That exam term is not in this school.");

  if (!hasRole(actor, ...OFFICE) && !(await isClassTeacherOf(actor, analysis.term.classId))) {
    return apiError(403, "forbidden", "Only that class's class teacher can view its results.");
  }

  return apiOk(analysis);
});
