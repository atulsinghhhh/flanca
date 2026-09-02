import { db } from "@/lib/db";
import { requireMobileActor, hasRole } from "@/lib/mobile/session";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

const REPORT_CARD_SELECT = {
  id: true,
  examTermId: true,
  classId: true,
  sectionId: true,
  snapshot: true,
  totalMarks: true,
  maxMarks: true,
  percentage: true,
  grade: true,
  rankInClass: true,
  attendancePercent: true,
  classTeacherRemark: true,
  principalRemark: true,
  publishedAt: true,
  generatedAt: true,
  examTerm: { select: { name: true } },
  class: { select: { name: true } },
  section: { select: { name: true } },
} as const;

/**
 * A student/parent's own report card(s) — the frozen snapshot
 * src/app/app/report-cards/[id]/page.tsx reads straight off `ReportCard`
 * (snapshot json + totals + grade + rank + attendance + remarks), fetched
 * here by studentId instead of by card id.
 *
 * Gated by `publishedAt: { not: null }` — the exact field the web page's
 * "Not published — parents cannot see these yet" hint (report-cards/page.tsx)
 * is keyed on. A generated-but-unpublished card (report.generate without
 * report.publish, in exams/actions.ts) never appears here.
 *
 * Returns every published card, most recent first, rather than just the
 * latest — a family reasonably wants last term's card to stay reachable
 * after this term's is generated, not just the newest snapshot.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);

  const student = await db.student.findFirst({
    where: { schoolId: actor.schoolId, userId: actor.id },
    select: { id: true },
  });
  if (student) {
    const reportCards = await db.reportCard.findMany({
      where: { schoolId: actor.schoolId, studentId: student.id, publishedAt: { not: null } },
      orderBy: { generatedAt: "desc" },
      select: REPORT_CARD_SELECT,
    });
    return apiOk({ role: "STUDENT", reportCards });
  }

  if (hasRole(actor, "PARENT")) {
    const links = await db.parentLink.findMany({
      where: { schoolId: actor.schoolId, userId: actor.id },
      select: { student: { select: { id: true, name: true } } },
    });

    const children = await Promise.all(
      links.map(async (l) => ({
        studentId: l.student.id,
        studentName: l.student.name,
        reportCards: await db.reportCard.findMany({
          where: { schoolId: actor.schoolId, studentId: l.student.id, publishedAt: { not: null } },
          orderBy: { generatedAt: "desc" },
          select: REPORT_CARD_SELECT,
        }),
      })),
    );
    return apiOk({ role: "PARENT", children });
  }

  return apiOk({ role: "NONE", reportCards: [] });
});
