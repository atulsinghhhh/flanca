"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { startThread } from "./actions";

/**
 * The first message and the conversation are one action: a thread with nothing in
 * it is noise in somebody's inbox.
 */
export function StartForm({
  targetUserId,
  targetName,
  studentId,
  studentName,
  circularId,
  circularTitle,
}: {
  targetUserId: string;
  targetName: string;
  studentId: string | null;
  studentName: string | null;
  circularId?: string | null;
  circularTitle?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function send() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    // The "Re:" line goes into the message itself, not only into a column on the
    // thread. A parent replying to a second notice lands in the SAME conversation
    // with the office — one conversation per person, not one per circular — so the
    // provenance has to live somewhere that survives that, and the message record
    // is the thing nobody can edit later.
    const withContext = circularTitle ? `Re: “${circularTitle}”\n\n${text}` : text;
    start(async () => {
      const r = await startThread({
        targetUserId,
        studentId,
        body: withContext,
        subject: circularTitle ?? null,
        originCircularId: circularId ?? null,
      });
      if ("error" in r && r.error) {
        setError(r.error);
        return;
      }
      if ("threadId" in r) router.push(`/app/chat/${r.threadId}`);
    });
  }

  return (
    <div className="px-5 py-4">
      {circularTitle ? (
        <p className="mb-3 rounded-md border border-line bg-paper-2/70 px-3 py-2 text-[13px] text-ink-2">
          Replying to the notice <span className="font-semibold text-ink">{circularTitle}</span>. Only the
          school sees this — no other parent does.
        </p>
      ) : null}
      <p className="text-[13.5px] text-ink-2">
        To <span className="font-semibold text-ink">{targetName}</span>
        {studentName ? (
          <>
            , about <span className="font-semibold text-ink">{studentName}</span>
          </>
        ) : null}
      </p>

      {error ? (
        <p className="mt-3 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13px] text-overdue">
          {error}
        </p>
      ) : null}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="What would you like to say?"
        className="mt-3 w-full resize-y rounded-md border border-line-2 bg-white px-3 py-2 text-[14.5px] outline-none focus:border-brand"
      />

      <div className="mt-3 flex items-center gap-3">
        <Button onClick={send} disabled={pending || !body.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send
        </Button>
        <p className="text-[12.5px] text-ink-3">
          Stays inside the school. No SMS, no WhatsApp, nothing to pay for.
        </p>
      </div>
    </div>
  );
}
