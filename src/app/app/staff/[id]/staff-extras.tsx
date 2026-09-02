"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, IndianRupee, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { recordStaffAdvance } from "../actions";
import { addCpdRecord } from "../people-actions";

const INPUT =
  "h-9.5 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

export function AddAdvance({ staffId }: { staffId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");

  function submit() {
    setError(null);
    start(async () => {
      const r = await recordStaffAdvance({ staffId, amountText, reason: reason || undefined });
      if (r.error) {
        setError(r.error);
        return;
      }
      setAmountText("");
      setReason("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="border-t border-line px-5 py-3">
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <IndianRupee className="size-3.5" /> Record an advance
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-line px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="eyebrow text-ink-3 mb-1 block">Amount</label>
          <input
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            className={INPUT}
            inputMode="decimal"
            placeholder="5,000"
          />
        </div>
        <div>
          <label className="eyebrow text-ink-3 mb-1 block">Reason (optional)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={INPUT}
            placeholder="Medical, festival…"
          />
        </div>
      </div>
      {error ? <p className="text-[12.5px] text-overdue">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending || !amountText.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Record
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </div>
  );
}

export function AddCpd({ staffId }: { staffId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [hours, setHours] = useState("");
  const [completedOnIso, setCompletedOnIso] = useState("");

  function submit() {
    setError(null);
    start(async () => {
      const r = await addCpdRecord({
        staffId,
        title,
        provider: provider || undefined,
        hours: Number(hours),
        completedOnIso: completedOnIso || undefined,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      setTitle("");
      setProvider("");
      setHours("");
      setCompletedOnIso("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="border-t border-line px-5 py-3">
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> Add a CPD record
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-line px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="eyebrow text-ink-3 mb-1 block">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} placeholder="NEP workshop on FLN" />
        </div>
        <div>
          <label className="eyebrow text-ink-3 mb-1 block">Provider (optional)</label>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} className={INPUT} placeholder="DIET, SCERT…" />
        </div>
        <div>
          <label className="eyebrow text-ink-3 mb-1 block">Hours</label>
          <input
            value={hours}
            onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))}
            className={INPUT}
            inputMode="numeric"
          />
        </div>
        <div>
          <label className="eyebrow text-ink-3 mb-1 block">Completed on</label>
          <input type="date" value={completedOnIso} onChange={(e) => setCompletedOnIso(e.target.value)} className={INPUT} />
        </div>
      </div>
      {error ? <p className="text-[12.5px] text-overdue">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending || !title.trim() || !hours.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </div>
  );
}
