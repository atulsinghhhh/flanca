import { db } from "@/lib/db";
import { getShortageReport } from "@/lib/queries/attendance";
import { requireMobileRole, TEACHING, hasRole, OFFICE } from "@/lib/mobile/session";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/app/app/attendance/shortage/page.tsx: a teacher sees only the
 * sections they are class teacher of; office sees the whole school. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const raw = Number(new URL(req.url).searchParams.get("required") ?? 75) || 75;
  const required = Math.min(100, Math.max(50, raw));

  const onlySectionIds = hasRole(actor, ...OFFICE)
    ? undefined
    : (
        await db.section.findMany({
          where: { schoolId: actor.schoolId, classTeacherId: actor.id },
          select: { id: true },
        })
      ).map((s) => s.id);

  const report = await getShortageReport(actor.schoolId, required, onlySectionIds);
  return apiOk(report);
});
