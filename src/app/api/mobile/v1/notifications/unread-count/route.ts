import { requireMobileActor } from "@/lib/mobile/session";
import { getUnreadNotificationCount } from "@/lib/queries/notifications";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors the bell badge's count query — src/lib/queries/notifications.ts::getUnreadNotificationCount. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const count = await getUnreadNotificationCount(actor.schoolId, actor.id);
  return apiOk({ count });
});
