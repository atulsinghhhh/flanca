import { db } from "@/lib/db";
import { resolveDay } from "@/lib/queries/when";
import { getMarkingStatus } from "@/lib/queries/attendance";
import { requireMobileRole, hasRole, OFFICE, TEACHING } from "@/lib/mobile/session";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/app/app/attendance/page.tsx: office sees every section, a teacher only their own. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const date = new URL(req.url).searchParams.get("date") ?? undefined;
  const when = resolveDay(date);

  const onlySectionIds = hasRole(actor, ...OFFICE)
    ? undefined
    : (
        await db.section.findMany({
          where: { schoolId: actor.schoolId, classTeacherId: actor.id },
          select: { id: true },
        })
      ).map((s) => s.id);

  const status = await getMarkingStatus(actor.schoolId, when, onlySectionIds);
  return apiOk(status);
});
