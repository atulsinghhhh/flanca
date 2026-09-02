"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { setThreadClosed } from "./actions";

/**
 * The office closing a conversation, or opening it again.
 *
 * Closing is a timestamp, never a delete — the conversation stays readable and the
 * button says so, because an office clerk pressing something called "Close" needs
 * to know it is not destroying a record.
 */
export function CloseThread({ threadId, closed }: { threadId: string; closed: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    start(async () => {
      const r = await setThreadClosed({ threadId, closed: !closed });
      if ("error" in r && r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button variant="quiet" size="sm" onClick={toggle} disabled={pending}>
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : closed ? (
          <LockOpen className="size-3.5" />
        ) : (
          <Lock className="size-3.5" />
        )}
        {closed ? "Reopen" : "Close"}
      </Button>
      {error ? <span className="text-[11.5px] text-overdue">{error}</span> : null}
    </span>
  );
}
