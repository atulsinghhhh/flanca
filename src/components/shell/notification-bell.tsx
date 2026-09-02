"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { listMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/app/app/notifications/actions";

type Row = {
  id: string;
  kind: string;
  title: string;
  body: string;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * The bell. Fetches its own list on open rather than carrying 20 rows on every
 * page — most opens of the app never touch it, so there is no reason to pay for
 * the query on every navigation. `unreadCount` is the one thing worth carrying,
 * because it is what tells a person there is something to open at all.
 */
export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, start] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openDrawer() {
    setOpen((v) => !v);
    if (!rows) {
      start(async () => {
        const r = await listMyNotifications();
        setRows(r.notifications);
      });
    }
  }

  function openRow(row: Row) {
    if (!row.readAt) {
      setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, readAt: new Date().toISOString() } : r)) ?? null);
      start(async () => {
        await markNotificationRead({ notificationId: row.id });
        router.refresh();
      });
    }
    setOpen(false);
    if (row.linkUrl) router.push(row.linkUrl);
  }

  function markAll() {
    setRows((prev) => prev?.map((r) => ({ ...r, readAt: r.readAt ?? new Date().toISOString() })) ?? null);
    start(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={openDrawer}
        className="relative rounded-md p-2 text-ink-3 hover:bg-paper-2 hover:text-ink"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="size-4.5" />
        {unreadCount > 0 ? (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-brand text-[9.5px] font-bold text-white tnum">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[340px] overflow-hidden rounded-lg border border-line bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <p className="text-[13.5px] font-semibold">Notifications</p>
            {rows && rows.some((r) => !r.readAt) ? (
              <button
                onClick={markAll}
                disabled={pending}
                className="flex items-center gap-1 text-[12px] font-semibold text-brand hover:text-brand-dark disabled:opacity-60"
              >
                {pending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {!rows ? (
              <div className="flex items-center justify-center px-5 py-8">
                <Loader2 className="size-4 animate-spin text-ink-3" />
              </div>
            ) : rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-ink-3">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((row) => (
                  <li key={row.id}>
                    <button
                      onClick={() => openRow(row)}
                      className={cn(
                        "flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-paper-2/60",
                        !row.readAt && "bg-brand-light/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                          row.readAt ? "bg-transparent" : "bg-brand",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn("truncate text-[13px]", row.readAt ? "font-medium" : "font-semibold")}>
                            {row.title}
                          </span>
                          <span className="shrink-0 text-[10.5px] text-ink-3">{relativeTime(row.createdAt)}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-ink-2">
                          {row.body}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/app/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-3.5 py-2.5 text-center text-[12.5px] font-semibold text-brand hover:bg-paper-2/60"
          >
            See all
          </Link>
        </div>
      ) : null}
    </div>
  );
}
