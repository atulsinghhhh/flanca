"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { disposeAsset } from "./actions";

/**
 * Writing off an asset needs a reason on record, not just a click — this is the one
 * asset action that cannot be undone from the screen.
 */
export function DisposeAssetButton({ assetId, assetName }: { assetId: string; assetName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[11px] font-semibold text-overdue hover:underline">
        Write off
      </button>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={`Why is ${assetName} being written off?`}
        className="h-7 w-full rounded border border-line-2 bg-white px-1.5 text-[11px] outline-none focus:border-brand"
      />
      {error ? <p className="text-[11px] text-overdue">{error}</p> : null}
      <div className="flex items-center gap-3">
        <button
          disabled={pending || !reason.trim()}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await disposeAsset(assetId, reason);
              if (r?.error) {
                setError(r.error);
                return;
              }
              setOpen(false);
              setReason("");
              router.refresh();
            })
          }
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-overdue disabled:opacity-40"
        >
          {pending ? <Loader2 className="size-3 animate-spin" /> : null} Confirm
        </button>
        <button onClick={() => setOpen(false)} className="text-[11px] font-semibold text-ink-3">
          Cancel
        </button>
      </div>
    </div>
  );
}
