"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Archive, Inbox, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, PageHead } from "@/components/ui/primitives";
import type { InboxRow } from "@/lib/queries/chat";
import { Avatar } from "./avatar";
import { NotifyToggle } from "./notify-toggle";

/** Today shows a time; anything older shows a date. A school reads it that way. */
function when(d: Date) {
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  return sameDay
    ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * The messaging-app frame: a conversation list on the left, whatever is open on
 * the right. Both are always visible on a wide screen, the way WhatsApp Web or
 * Telegram Desktop do it; on a phone only one shows at a time, decided by the URL
 * rather than by state that could drift from what is actually on screen — the
 * back arrow in the open pane is a plain link to `/app/chat`, not a button that
 * has to remember where it came from.
 */
export function ChatShell({
  open,
  closed,
  pushKey,
  children,
}: {
  open: InboxRow[];
  closed: InboxRow[];
  pushKey: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [query, setQuery] = useState("");

  const activeThreadId = /^\/app\/chat\/([^/]+)$/.exec(pathname)?.[1] ?? null;
  const showingDetail = activeThreadId !== null || pathname === "/app/chat/new";

  const rows = tab === "open" ? open : closed;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.with.toLowerCase().includes(q) || r.about?.toLowerCase().includes(q));
  }, [rows, query]);

  const unreadTotal = open.reduce((n, r) => n + (r.unread > 0 ? 1 : 0), 0);

  return (
    <>
      <PageHead
        eyebrow="Chat"
        title="Conversations"
        sub="Inside the school, on the record. A parent can reach their child's class teacher, the office and accounts — and nobody else."
      />

      <div className="mt-5 grid h-[calc(100dvh-13.5rem)] min-h-[520px] grid-cols-1 overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] lg:grid-cols-[320px_1fr]">
        {/* ── Conversation list ─────────────────────────────────────────── */}
        <aside
          className={cn(
            "flex min-h-0 flex-col border-line lg:flex lg:border-r",
            showingDetail ? "hidden" : "flex",
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="inline-flex rounded-lg bg-paper-2 p-0.5 text-[12.5px] font-semibold">
              <button
                onClick={() => setTab("open")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors",
                  tab === "open" ? "bg-white text-ink shadow-sm" : "text-ink-3 hover:text-ink-2",
                )}
              >
                <Inbox className="size-3.5" /> Open
                {unreadTotal > 0 ? <Badge tone="brand">{unreadTotal}</Badge> : null}
              </button>
              <button
                onClick={() => setTab("closed")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors",
                  tab === "closed" ? "bg-white text-ink shadow-sm" : "text-ink-3 hover:text-ink-2",
                )}
              >
                <Archive className="size-3.5" /> Closed
              </button>
            </div>
            <Link
              href="/app/chat/new"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-dark"
              aria-label="New conversation"
              title="New conversation"
            >
              <Plus className="size-4" />
            </Link>
          </div>

          <div className="shrink-0 border-b border-line px-3 py-2.5">
            <div className="flex items-center gap-2 rounded-md border border-line-2 bg-paper-2/60 px-2.5">
              <Search className="size-3.5 shrink-0 text-ink-3" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations"
                className="h-8.5 w-full bg-transparent text-[13.5px] outline-none placeholder:text-ink-3"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-[13.5px] font-medium text-ink-2">
                  {query.trim()
                    ? "No conversations match that search."
                    : tab === "closed"
                      ? "Nothing has been closed."
                      : "No conversations yet."}
                </p>
                {!query.trim() && tab === "open" ? (
                  <p className="mt-1 text-[12.5px] text-ink-3">
                    Start one, or wait for a parent or a colleague to write to you.
                  </p>
                ) : null}
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {filtered.map((r) => (
                  <li key={r.threadId}>
                    <Link
                      href={`/app/chat/${r.threadId}`}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 hover:bg-paper-2/60",
                        activeThreadId === r.threadId && "bg-brand-light/60",
                      )}
                    >
                      <Avatar name={r.with} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn("truncate text-[13.5px]", r.unread > 0 ? "font-semibold" : "font-medium")}>
                            {r.with}
                          </span>
                          <span className="shrink-0 text-[11px] text-ink-3">{when(r.lastMessageAt)}</span>
                        </span>
                        {r.about ? <span className="block truncate text-[11.5px] text-ink-3">About {r.about}</span> : null}
                        <span className="flex items-center justify-between gap-2">
                          {r.preview ? (
                            <span className={cn("mt-0.5 truncate text-[13px]", r.unread > 0 ? "text-ink" : "text-ink-3")}>
                              {r.preview}
                            </span>
                          ) : (
                            <span className="mt-0.5 text-[13px] text-ink-3 italic">No messages yet</span>
                          )}
                          {r.unread > 0 ? (
                            <Badge tone="brand" className="shrink-0">
                              {r.unread}
                            </Badge>
                          ) : null}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-line px-4 py-2.5">
            <NotifyToggle publicKey={pushKey} />
          </div>
        </aside>

        {/* ── Whatever is open: a conversation, the new-message picker, or nothing ── */}
        <section className={cn("flex min-h-0 flex-col", showingDetail ? "flex" : "hidden lg:flex")}>
          {children}
        </section>
      </div>
    </>
  );
}
