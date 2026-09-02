import { db } from "@/lib/db";
import { requireMobileActor } from "@/lib/mobile/session";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/app/app/notifications/actions.ts::markNotificationRead. */
export const POST = withMobileRoute(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const actor = await requireMobileActor(req);
  const { id } = await params;

  await db.notification.updateMany({
    where: { id, userId: actor.id, schoolId: actor.schoolId, readAt: null },
    data: { readAt: new Date() },
  });

  return apiOk({ ok: true as const });
});
