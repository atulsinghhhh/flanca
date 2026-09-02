"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockOpen } from "lucide-react";
import { unlockAttendance } from "../actions";

export function UnlockButton({ sectionId, date }: { sectionId: string; date: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
      >
        <LockOpen className="size-3.5" /> Unlock for teacher
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-[13px]">
      Reopen this day for editing?
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await unlockAttendance(sectionId, date);
            if (r.error) {
              setError(r.error);
              return;
            }
            router.refresh();
          })
        }
        className="font-semibold text-overdue hover:underline disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Yes, unlock"}
      </button>
      <button onClick={() => setConfirming(false)} className="font-semibold text-ink-3 hover:text-ink">
        Cancel
      </button>
      {error ? <span className="text-overdue">{error}</span> : null}
    </span>
  );
}
