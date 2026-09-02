"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardHead, Empty } from "@/components/ui/primitives";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

const WHEN = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function NotificationList({ initial }: { initial: NotificationRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [pending, start] = useTransition();

  const unread = rows.filter((r) => !r.readAt).length;

  function open(row: NotificationRow) {
    if (!row.readAt) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, readAt: new Date().toISOString() } : r)));
      start(async () => {
        await markNotificationRead({ notificationId: row.id });
        router.refresh();
      });
    }
    if (row.linkUrl) router.push(row.linkUrl);
  }

  function markAll() {
    setRows((prev) => prev.map((r) => ({ ...r, readAt: r.readAt ?? new Date().toISOString() })));
    start(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHead
        title="All notifications"
        hint={unread > 0 ? `${unread} unread` : "All read"}
        action={
          unread > 0 ? (
            <Button size="sm" variant="secondary" onClick={markAll} disabled={pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <Empty title="Nothing yet." hint="Fee reminders, graded homework, circulars and messages will show up here." />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                onClick={() => open(row)}
                className={cn(
                  "flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-paper-2/60",
                  !row.readAt && "bg-brand-light/40",
                )}
              >
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", row.readAt ? "bg-transparent" : "bg-brand")} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className={cn("text-[13.5px]", row.readAt ? "font-medium" : "font-semibold")}>{row.title}</span>
                    <span className="text-[11.5px] text-ink-3">{WHEN(row.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{row.body}</span>
                </span>
                <Badge tone="neutral" className="mt-0.5 shrink-0">
                  {row.kind}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
