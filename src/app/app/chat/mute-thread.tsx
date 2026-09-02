"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { setThreadMuted } from "./actions";

/**
 * Muting stops the buzz in your pocket without leaving the conversation or hiding
 * it — the unread badge still climbs, only the push notification is skipped.
 */
export function MuteThread({ threadId, muted }: { threadId: string; muted: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    start(async () => {
      const r = await setThreadMuted({ threadId, muted: !muted });
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
        ) : muted ? (
          <BellOff className="size-3.5" />
        ) : (
          <Bell className="size-3.5" />
        )}
        {muted ? "Unmute" : "Mute"}
      </Button>
      {error ? <span className="text-[11.5px] text-overdue">{error}</span> : null}
    </span>
  );
}
