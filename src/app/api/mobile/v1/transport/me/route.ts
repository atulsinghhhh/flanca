import { db } from "@/lib/db";
import { getMyTransport } from "@/lib/queries/transport";
import { requireMobileActor, hasRole } from "@/lib/mobile/session";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/**
 * "Which bus/stop is my child on" — the read-only transport view for a
 * STUDENT (their own assignment) or a PARENT (one entry per linked child).
 * Route/stop CRUD and boarding a child stay office-only, in
 * src/app/app/transport/actions.ts.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);

  if (hasRole(actor, "STUDENT")) {
    const student = await db.student.findFirst({
      where: { schoolId: actor.schoolId, userId: actor.id },
      select: { id: true, name: true },
    });
    if (!student) return apiError(404, "not_found", "No student record is linked to this account.");

    const transport = await getMyTransport(actor.schoolId, student.id);
    return apiOk({ student, transport });
  }

  if (hasRole(actor, "PARENT")) {
    const links = await db.parentLink.findMany({
      where: { schoolId: actor.schoolId, userId: actor.id },
      include: { student: { select: { id: true, name: true } } },
    });

    const children = await Promise.all(
      links.map(async (link) => ({
        student: link.student,
        transport: await getMyTransport(actor.schoolId, link.student.id),
      })),
    );

    return apiOk({ children });
  }

  return apiError(403, "not_applicable", "This view is for students and parents.");
});
