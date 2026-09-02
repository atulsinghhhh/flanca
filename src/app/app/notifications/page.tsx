import { requireActor } from "@/lib/session";
import { getRecentNotifications } from "@/lib/queries/notifications";
import { PageHead } from "@/components/ui/primitives";
import { NotificationList, type NotificationRow } from "./notification-list";
import { PreferencesCard } from "./preferences-card";

export const metadata = { title: "Notifications — Flanca" };

export default async function NotificationsPage() {
  const actor = await requireActor();
  const rows = await getRecentNotifications(actor.schoolId, actor.id, 100);

  const initial: NotificationRow[] = rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    linkUrl: n.linkUrl,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHead eyebrow="Connect" title="Notifications" sub="Everything the school has told you, in one place." />
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        <NotificationList initial={initial} />
        <PreferencesCard />
      </div>
    </>
  );
}
