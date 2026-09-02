import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/session";
import { requireMobileActor } from "@/lib/mobile/session";
import { validateQuietHours } from "@/lib/core/notify-core";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  pushEnabled: z.boolean(),
  quietHoursStart: z.number().int().nullable(),
  quietHoursEnd: z.number().int().nullable(),
});

/** Mirrors src/app/app/notifications/actions.ts::getMyNotificationPreference. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const pref = await db.notificationPreference.findUnique({ where: { userId: actor.id } });

  return apiOk({
    pushEnabled: pref?.pushEnabled ?? true,
    quietHoursStart: pref?.quietHoursStart ?? null,
    quietHoursEnd: pref?.quietHoursEnd ?? null,
  });
});

/** Mirrors src/app/app/notifications/actions.ts::updateNotificationPreference. */
export const PUT = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const input = Body.parse(await req.json());

  const check = validateQuietHours(input.quietHoursStart, input.quietHoursEnd);
  if (!check.ok) return apiError(422, "invalid_quiet_hours", check.error!);

  await db.notificationPreference.upsert({
    where: { userId: actor.id },
    create: {
      userId: actor.id,
      pushEnabled: input.pushEnabled,
      quietHoursStart: input.quietHoursStart,
      quietHoursEnd: input.quietHoursEnd,
    },
    update: {
      pushEnabled: input.pushEnabled,
      quietHoursStart: input.quietHoursStart,
      quietHoursEnd: input.quietHoursEnd,
    },
  });

  // A personal setting, not a school record — audited under the person's own
  // name so they can see their own history, not folded into the school-wide log.
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "notification-preference.update",
    entity: "NotificationPreference",
    entityId: actor.id,
    summary: `${actor.name} changed their own notification settings`,
  });

  return apiOk({ ok: true as const });
});
