import { requireMobileRole, hasRole, OFFICE, TEACHING } from "@/lib/mobile/session";
import { getReportCardScope, getExamTerms } from "@/lib/queries/exams";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/**
 * Report-card cycle list for staff — narrower than /exams/terms. A subject-only
 * teacher must not see this: report cards belong to a class's own class
 * teacher, never to whoever happens to teach one subject there. Reusing
 * /exams/terms here (as the exam-cycle list correctly does) would leak every
 * class a subject teacher touches into their "Report cards" screen.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const isOffice = hasRole(actor, ...OFFICE);
  const scope = await getReportCardScope(actor, isOffice);
  const terms = await getExamTerms(actor.schoolId, scope);
  return apiOk({ terms });
});
