"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireActor } from "@/lib/session";
import { getRecentNotifications } from "@/lib/queries/notifications";
import { validateQuietHours } from "@/lib/core/notify-core";

/**
 * The bell's dropdown fetches its own list on open, the same way chat's
 * oversight panel fetches on open — the initial page render stays light, and
 * whoever opens the drawer always sees what is true right now, not what was
 * true when the layout last rendered.
 */
export async function listMyNotifications() {
  const actor = await requireActor();
  const rows = await getRecentNotifications(actor.schoolId, actor.id, 20);
  return {
    ok: true as const,
    notifications: rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      linkUrl: n.linkUrl,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

export async function markNotificationRead(input: { notificationId: string }) {
  const actor = await requireActor();

  await db.notification.updateMany({
    where: { id: input.notificationId, userId: actor.id, schoolId: actor.schoolId, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/app/notifications");
  return { ok: true as const };
}

export async function markAllNotificationsRead() {
  const actor = await requireActor();

  await db.notification.updateMany({
    where: { userId: actor.id, schoolId: actor.schoolId, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/app/notifications");
  return { ok: true as const };
}

/** A person's own preference — absence means the defaults, so most people have no row at all. */
export async function getMyNotificationPreference() {
  const actor = await requireActor();
  const pref = await db.notificationPreference.findUnique({ where: { userId: actor.id } });
  return {
    pushEnabled: pref?.pushEnabled ?? true,
    quietHoursStart: pref?.quietHoursStart ?? null,
    quietHoursEnd: pref?.quietHoursEnd ?? null,
  };
}

export async function updateNotificationPreference(input: {
  pushEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}) {
  const actor = await requireActor();

  const check = validateQuietHours(input.quietHoursStart, input.quietHoursEnd);
  if (!check.ok) return { error: check.error! };

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

  revalidatePath("/app/notifications");
  return { ok: true as const };
}
