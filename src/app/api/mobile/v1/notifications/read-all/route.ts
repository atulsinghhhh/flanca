import { db } from "@/lib/db";
import { requireMobileActor } from "@/lib/mobile/session";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/app/app/notifications/actions.ts::markAllNotificationsRead. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);

  await db.notification.updateMany({
    where: { userId: actor.id, schoolId: actor.schoolId, readAt: null },
    data: { readAt: new Date() },
  });

  return apiOk({ ok: true as const });
});
