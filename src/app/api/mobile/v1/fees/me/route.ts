import { db } from "@/lib/db";
import { getStudentFeePosition } from "@/lib/queries/fees";
import { resolveDay } from "@/lib/queries/when";
import { requireMobileActor, hasRole } from "@/lib/mobile/session";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/**
 * "What does my child owe" — the read-only fee view for the app's home
 * audience: a STUDENT sees their own position, a PARENT sees one entry per
 * linked child. Office/back-office fee workflows (collection, reversal,
 * reminders, concessions) are not part of this view.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const asOf = resolveDay(new URL(req.url).searchParams.get("asOf") ?? undefined);

  if (hasRole(actor, "STUDENT")) {
    const student = await db.student.findFirst({
      where: { schoolId: actor.schoolId, userId: actor.id },
      select: { id: true, name: true },
    });
    if (!student) return apiError(404, "not_found", "No student record is linked to this account.");

    const position = await getStudentFeePosition(actor.schoolId, student.id, asOf);
    return apiOk({ student, position });
  }

  if (hasRole(actor, "PARENT")) {
    const links = await db.parentLink.findMany({
      where: { schoolId: actor.schoolId, userId: actor.id },
      include: { student: { select: { id: true, name: true } } },
    });

    const children = await Promise.all(
      links.map(async (link) => ({
        student: link.student,
        position: await getStudentFeePosition(actor.schoolId, link.student.id, asOf),
      })),
    );

    return apiOk({ children });
  }

  return apiError(403, "not_applicable", "This view is for students and parents.");
});
