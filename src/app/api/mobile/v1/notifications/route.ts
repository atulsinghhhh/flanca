import { requireMobileActor } from "@/lib/mobile/session";
import { getRecentNotifications } from "@/lib/queries/notifications";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/app/app/notifications/actions.ts::listMyNotifications. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const rows = await getRecentNotifications(actor.schoolId, actor.id, 20);

  return apiOk({
    notifications: rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      linkUrl: n.linkUrl,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
});
