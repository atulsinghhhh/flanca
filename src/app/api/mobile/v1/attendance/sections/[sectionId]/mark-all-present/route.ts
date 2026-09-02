import { z } from "zod";
import { db } from "@/lib/db";
import { requireMobileRole, TEACHING } from "@/lib/mobile/session";
import { saveAttendanceForActor } from "@/lib/mobile/mutations/attendance";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({ date: z.string().min(1) });

/** Mirrors src/app/app/attendance/actions.ts::markAllPresent. */
export const POST = withMobileRoute(async (req: Request, { params }: { params: Promise<{ sectionId: string }> }) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const { sectionId } = await params;
  const { date } = Body.parse(await req.json());

  const students = await db.student.findMany({
    where: { schoolId: actor.schoolId, sectionId, status: "ACTIVE" },
    select: { id: true },
  });

  const result = await saveAttendanceForActor(actor, sectionId, {
    date,
    marks: students.map((s) => ({ studentId: s.id, status: "PRESENT" })),
  });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ saved: result.saved, absent: result.absent, rejected: result.rejected });
});
