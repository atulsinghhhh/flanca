import { requireMobileActor } from "@/lib/mobile/session";
import { resolveDay } from "@/lib/queries/when";
import { getMyTimetableForDay } from "@/lib/queries/timetable";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/**
 * The signed-in staff member's own periods for a day (today by default).
 * Same Monday=1 convention as role-home.ts::getTeacherHome, and the same
 * ?date= handling as the attendance sheet (resolveDay: unparseable or
 * future dates collapse to today).
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const date = new URL(req.url).searchParams.get("date") ?? undefined;
  const day = resolveDay(date);
  const dayOfWeek = ((day.getUTCDay() + 6) % 7) + 1;

  const timetable = await getMyTimetableForDay(actor.schoolId, actor.id, dayOfWeek);
  if (!timetable) return apiError(404, "not_found", "No staff record found for this account.");
  return apiOk(timetable);
});
