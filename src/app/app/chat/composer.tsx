"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { markThreadRead, postMessage } from "./actions";

/** Reply box. Enter sends, Shift+Enter makes a new line — the way a phone expects. */
export function Composer({ threadId, disabled }: { threadId: string; disabled?: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function send() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    start(async () => {
      const r = await postMessage({ threadId, body: text });
      if ("error" in r && r.error) {
        setError(r.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  if (disabled) {
    return (
      <p className="border-t border-line px-4 py-3.5 text-[13px] text-ink-3">{disabled}</p>
    );
  }

  return (
    <div className="border-t border-line bg-white px-3 py-2.5">
      {error ? (
        <p className="mb-2 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13px] text-overdue">
          {error}
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Write a message…"
          className="max-h-32 min-h-[42px] w-full resize-none rounded-2xl border border-line-2 bg-paper-2/50 px-3.5 py-2.5 text-[14.5px] leading-snug outline-none focus:border-brand focus:bg-white"
        />
        <Button
          size="md"
          onClick={send}
          disabled={pending || !body.trim()}
          className="!size-[42px] shrink-0 !rounded-full !px-0"
          aria-label="Send"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

/**
 * Opening a conversation is what marks it read, so the badge clears the moment
 * somebody actually looks — not when a page happens to render on the server.
 */
export function MarkRead({ threadId, unread }: { threadId: string; unread: number }) {
  const router = useRouter();

  useEffect(() => {
    if (unread <= 0) return;
    let cancelled = false;
    markThreadRead({ threadId }).then(() => {
      if (!cancelled) router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [threadId, unread, router]);

  return null;
}

/**
 * Keeps the newest message in view — on first opening a conversation, and again
 * whenever the message count changes, whether that is this device sending one or
 * `PollRefresh` picking one up from the other side.
 */
export function AutoScroll({ scrollId, dep }: { scrollId: string; dep: unknown }) {
  useEffect(() => {
    const el = document.getElementById(scrollId);
    if (el) el.scrollTop = el.scrollHeight;
  }, [scrollId, dep]);

  return null;
}

/**
 * The whole app is server-rendered with no realtime anywhere, and adding a socket
 * server would break rule 1. While a conversation is open on screen — and only
 * then — ask the server again every few seconds.
 */
export function PollRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [seconds, router]);

  return null;
}
