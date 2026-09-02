import { db } from "@/lib/db";
import { requireMobileActor, hasRole } from "@/lib/mobile/session";
import { getStudent } from "@/lib/queries/students";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/**
 * The mobile twin of the office's "any student" lookup (src/lib/queries/students.ts::getStudent),
 * constrained so a STUDENT or PARENT caller can only ever see their own child's record — never
 * an arbitrary studentId passed in a query string.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);

  if (hasRole(actor, "STUDENT")) {
    const student = await db.student.findFirst({
      where: { schoolId: actor.schoolId, userId: actor.id },
      select: { id: true },
    });
    if (!student) return apiError(404, "not_found", "No student profile is linked to this account.");

    const data = await getStudent(actor.schoolId, student.id);
    if (!data) return apiError(404, "not_found", "No student profile is linked to this account.");

    return apiOk({ role: "STUDENT", ...data });
  }

  if (hasRole(actor, "PARENT")) {
    const links = await db.parentLink.findMany({
      where: { schoolId: actor.schoolId, userId: actor.id },
      select: { studentId: true },
    });

    const children = (
      await Promise.all(links.map((l) => getStudent(actor.schoolId, l.studentId)))
    ).filter((c): c is NonNullable<typeof c> => c !== null);

    return apiOk({ role: "PARENT", children });
  }

  return apiError(403, "not_applicable", "This view is for students and parents.");
});
