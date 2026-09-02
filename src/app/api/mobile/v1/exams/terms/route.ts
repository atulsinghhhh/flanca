import { requireMobileActor, hasRole, OFFICE, TEACHING } from "@/lib/mobile/session";
import { getExamScope, getExamTerms } from "@/lib/queries/exams";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/**
 * Exam-cycle list. Mirrors src/app/app/exams/page.tsx's use of getExamTerms:
 * one row per cycle name, grouped across every class that ran it.
 *
 * OFFICE sees every cycle across every class. TEACHING (a non-office teacher)
 * sees only their own class (as class teacher) or their own subject (as its
 * timetabled teacher) — draft or published, since they need to see what still
 * needs marking, but never the whole school's.
 *
 * STUDENT/PARENT only ever see a cycle once every class's copy of it is
 * published (getExamTerms already folds each row's `isPublished` down to
 * "true only if every class in the cycle is published" — the same rule
 * report-cards/page.tsx uses for "parents cannot see these yet"), so this
 * filters the same list down to isPublished rows instead of hitting a
 * different query.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);

  if (hasRole(actor, ...OFFICE, ...TEACHING)) {
    // A subject-only teacher sees only their own classes/subjects, a class
    // teacher their own class, office everything — same rule the web page
    // and every other exam/attendance/report-card screen enforces.
    const scope = await getExamScope(actor, hasRole(actor, ...OFFICE));
    const terms = await getExamTerms(actor.schoolId, scope);
    return apiOk({ role: "STAFF", terms });
  }

  const terms = await getExamTerms(actor.schoolId);

  return apiOk({
    role: hasRole(actor, "PARENT") ? "PARENT" : "STUDENT",
    terms: terms.filter((t) => t.isPublished),
  });
});
