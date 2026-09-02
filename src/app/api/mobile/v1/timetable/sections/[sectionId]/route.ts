import { requireMobileActor } from "@/lib/mobile/session";
import { getSectionTimetable } from "@/lib/queries/timetable";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ sectionId: string }> };

/** A section's full week grid. Mirrors src/app/app/timetable/page.tsx's section view. */
export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileActor(req);
  const { sectionId } = await params;

  const timetable = await getSectionTimetable(actor.schoolId, sectionId);
  if (!timetable) return apiError(404, "not_found", "That section is not in this school.");
  return apiOk(timetable);
});
