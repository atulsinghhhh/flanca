import { requireMobileActor } from "@/lib/mobile/session";
import { listMyGroupChannels } from "@/lib/mobile/mutations/chat";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/**
 * Every announcement channel this account belongs to: a student's class
 * channel plus one per subject their class studies, or a teacher's own
 * class-teacher/subject-teacher channels. See listMyGroupChannels for how
 * membership and posting rights are derived from the current roster/timetable
 * rather than a stored snapshot.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const channels = await listMyGroupChannels(actor);
  return apiOk({ channels });
});
