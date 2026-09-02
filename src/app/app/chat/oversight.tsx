"use client";

import { useState, useTransition } from "react";
import { Eye, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { openWithOversight } from "./actions";

type Shown = { id: string; body: string; senderName: string; createdAt: string };

/**
 * The office's way into a conversation it is not part of.
 *
 * The messages arrive from the action, and are held here in state rather than on
 * the page — so there is no URL that shows them without the audit row being
 * written first, and a reload correctly loses them. Reading again is a new read,
 * and the school's record says so.
 */
export function OversightOpen({
  threadId,
  between,
  about,
}: {
  threadId: string;
  between: string;
  about: string | null;
}) {
  const [pending, start] = useTransition();
  const [messages, setMessages] = useState<Shown[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    start(async () => {
      const r = await openWithOversight({ threadId });
      if ("error" in r && r.error) {
        setError(r.error);
        return;
      }
      if ("messages" in r && r.messages) setMessages(r.messages);
    });
  }

  if (messages) {
    return (
      <div>
        <p className="flex items-start gap-2.5 border-b border-line bg-marigold-light/60 px-5 py-3 text-[13px] leading-relaxed text-marigold-ink-strong">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          Opened as the office. This read is now in the audit trail, with your name and the time.
        </p>
        {messages.length === 0 ? (
          <p className="px-5 py-4 text-[14px] text-ink-3">Nothing has been said in this conversation yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {messages.map((m) => (
              <li key={m.id} className="px-5 py-3">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px] font-semibold">{m.senderName}</span>
                  <span className="text-[11.5px] text-ink-3">
                    {new Date(m.createdAt).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </p>
                <p className="mt-1 text-[14.5px] leading-relaxed whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 py-5">
      <div className="flex items-start gap-3">
        <Eye className="mt-0.5 size-4 shrink-0 text-ink-3" />
        <div>
          <p className="text-[14px] leading-relaxed text-ink-2">
            This is a private conversation between <span className="font-semibold text-ink">{between}</span>
            {about ? (
              <>
                {" "}
                about <span className="font-semibold text-ink">{about}</span>
              </>
            ) : null}
            . You are not part of it.
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-3">
            As the office you may read it — and the school keeps a record that you did, so a parent or a
            teacher can always be told exactly who looked and when. Nobody is added to the conversation and
            neither of them is notified.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13px] text-overdue">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <Button variant="secondary" onClick={open} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
          Open and record this read
        </Button>
      </div>
    </div>
  );
}

