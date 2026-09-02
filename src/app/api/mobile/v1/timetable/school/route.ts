import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { getSchoolTimetableForDay } from "@/lib/queries/timetable";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Query = z.object({ dayOfWeek: z.coerce.number().int().min(1).max(6) });

/** Every section's timetable for one day, office-only — the master wall-chart view. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const sp = new URL(req.url).searchParams;
  const parsed = Query.safeParse({ dayOfWeek: sp.get("dayOfWeek") });
  if (!parsed.success) return apiError(422, "invalid_day", "Give a day of the week from 1 (Monday) to 6 (Saturday).");

  const timetable = await getSchoolTimetableForDay(actor.schoolId, parsed.data.dayOfWeek);
  return apiOk(timetable);
});
