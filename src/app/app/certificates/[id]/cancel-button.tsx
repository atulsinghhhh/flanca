"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { cancelCertificate } from "../actions";

export function CancelButton({ certificateId, cancelled }: { certificateId: string; cancelled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (cancelled) return null;

  function submit() {
    setError(null);
    start(async () => {
      const r = await cancelCertificate(certificateId, reason);
      if (r.error) {
        setError(r.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
        <Ban className="size-4" /> Cancel certificate
      </Button>
    );
  }

  return (
    <div className="w-full rounded-md border border-overdue/30 bg-overdue-light/60 px-3.5 py-3 sm:w-80">
      <p className="text-[13.5px] font-semibold">Cancel this certificate?</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
        The serial is retired, not reused. This cannot be undone.
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for cancelling"
        autoFocus
        className="mt-2 h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
      />
      {error ? <p className="mt-1.5 text-[12px] text-overdue">{error}</p> : null}
      <div className="mt-2.5 flex items-center gap-3">
        <Button size="sm" variant="danger" disabled={pending || !reason.trim()} onClick={submit}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null} Yes, cancel it
        </Button>
        <button
          onClick={() => {
            setConfirming(false);
            setReason("");
            setError(null);
          }}
          disabled={pending}
          className="text-[13px] font-semibold text-ink-3"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
