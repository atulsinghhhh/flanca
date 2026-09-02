import { db } from "@/lib/db";
import { getStudentFeePosition } from "@/lib/queries/fees";
import { resolveDay } from "@/lib/queries/when";
import { requireMobileActor, hasRole, MONEY } from "@/lib/mobile/session";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ studentId: string }> };

/**
 * One student's fee position, parameterized instead of resolved from the
 * actor — for office/accounts staff looking up any student in their school,
 * or a parent/student confirming it is their own view via /fees/me first and
 * then deep-linking here. Read-only: no collection, reversal, or concession
 * actions live behind this route.
 */
export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const { studentId } = await params;
  const asOf = resolveDay(new URL(req.url).searchParams.get("asOf") ?? undefined);
  const actor = await requireMobileActor(req);

  if (hasRole(actor, ...MONEY)) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: actor.schoolId },
      select: { id: true },
    });
    if (!student) return apiError(404, "not_found", "That student is not in this school.");

    const position = await getStudentFeePosition(actor.schoolId, studentId, asOf);
    return apiOk({ position });
  }

  if (hasRole(actor, "PARENT")) {
    const link = await db.parentLink.findFirst({
      where: { schoolId: actor.schoolId, userId: actor.id, studentId },
    });
    if (!link) return apiError(403, "forbidden", "You do not have access to this student.");

    const position = await getStudentFeePosition(actor.schoolId, studentId, asOf);
    return apiOk({ position });
  }

  if (hasRole(actor, "STUDENT")) {
    const student = await db.student.findFirst({
      where: { schoolId: actor.schoolId, userId: actor.id },
      select: { id: true },
    });
    if (!student || student.id !== studentId) {
      return apiError(403, "forbidden", "You do not have access to this student.");
    }

    const position = await getStudentFeePosition(actor.schoolId, studentId, asOf);
    return apiOk({ position });
  }

  return apiError(403, "forbidden", "You do not have access to this.");
});
