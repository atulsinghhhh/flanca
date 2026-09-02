import webpush from "web-push";
import { db } from "@/lib/db";
import { shouldSendPush } from "@/lib/core/notify-core";
import { currentHourIST } from "@/lib/queries/when";

/**
 * Web push — how a parent learns a message arrived, now that WhatsApp is gone.
 *
 * The keys are generated on the school's own server, so there is no provider
 * account, no template approval and no per-message cost. That is the whole reason
 * this exists rather than a BSP integration.
 *
 * Two disciplines carried over from the message log (see docs/STATUS.md phase 7,
 * where paid messages sat QUEUED for a provider that never arrived):
 *
 *  - With no keys configured this is a NO-OP, silently and by design. Chat must work
 *    completely without push; nothing anywhere claims a notification was delivered
 *    that no push service accepted.
 *  - A dead endpoint is deleted, not retried. Browsers drop subscriptions when
 *    storage is cleared or an app is removed, and the push service says so with a
 *    404 or a 410. Keeping those rows would mean a growing pile of guaranteed
 *    failures on every send.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@flanca.online";

export const pushConfigured = Boolean(PUBLIC_KEY && PRIVATE_KEY);

if (pushConfigured) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY as string, PRIVATE_KEY as string);
}

/** The public key the browser needs to subscribe. Null when push is not set up. */
export function pushPublicKey() {
  return pushConfigured ? (PUBLIC_KEY as string) : null;
}

export type PushNote = { title: string; body: string; url: string; tag?: string };

/**
 * Notify one person on every device they have agreed to. Never throws: a failed
 * notification must not fail the message that caused it — the message is already
 * safely in the database, and the badge will do the job when they next look.
 */
export async function pushToUser(schoolId: string, userId: string, note: PushNote) {
  if (!pushConfigured) return { sent: 0, removed: 0 };

  // Absence means the defaults (push on, no quiet hours), so most people never
  // have a row here at all — checked before touching PushSubscription, since a
  // muted person's devices are not worth a second query.
  const pref = await db.notificationPreference.findUnique({ where: { userId } });
  const allowed = shouldSendPush({
    pushEnabled: pref?.pushEnabled ?? true,
    quiet: { start: pref?.quietHoursStart ?? null, end: pref?.quietHoursEnd ?? null },
    currentHour: currentHourIST(),
  });
  if (!allowed) return { sent: 0, removed: 0 };

  const subs = await db.pushSubscription.findMany({ where: { schoolId, userId } });
  if (subs.length === 0) return { sent: 0, removed: 0 };

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(note),
          { TTL: 60 * 60 * 12 },
        );
        sent += 1;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          dead.push(sub.id);
          return;
        }
        // Anything else is transient or a misconfiguration. Record it against the
        // row so the office can see why a parent stopped being notified, rather
        // than losing it to a server log nobody reads.
        await db.pushSubscription
          .update({
            where: { id: sub.id },
            data: { lastError: `${status ?? "?"} ${(e as Error).message}`.slice(0, 300) },
          })
          .catch(() => undefined);
      }
    }),
  );

  if (dead.length > 0) {
    await db.pushSubscription.deleteMany({ where: { id: { in: dead } } }).catch(() => undefined);
  }

  return { sent, removed: dead.length };
}
