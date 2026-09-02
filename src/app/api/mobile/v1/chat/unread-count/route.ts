import { requireMobileActor } from "@/lib/mobile/session";
import { getUnreadThreadCount } from "@/lib/queries/chat";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/lib/queries/chat.ts::getUnreadThreadCount — the sidebar badge. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);

  const count = await getUnreadThreadCount(actor.schoolId, actor.id);
  return apiOk({ count });
});
