import { db } from "@/lib/db";

/** The badge on the bell. One indexed count, read on every page load. */
export async function getUnreadNotificationCount(schoolId: string, userId: string) {
  return db.notification.count({ where: { schoolId, userId, readAt: null } });
}

/** What the bell's dropdown shows — newest first, capped, no pagination here. */
export async function getRecentNotifications(schoolId: string, userId: string, take = 20) {
  return db.notification.findMany({
    where: { schoolId, userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
