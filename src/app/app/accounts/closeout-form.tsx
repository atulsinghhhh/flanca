"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { formatMoney, paiseFromText } from "@/lib/core/money";
import { closeTheDay } from "@/app/app/fees/actions";

export function CloseoutForm({
  date,
  cashExpected,
  existing,
}: {
  date: string;
  cashExpected: number;
  existing: { cashCounted: number; variance: number; note: string | null } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [counted, setCounted] = useState(
    String((existing?.cashCounted ?? cashExpected) / 100),
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [message, setMessage] = useState<string | null>(null);

  const variance = (paiseFromText(counted) ?? 0) - cashExpected;

  function submit() {
    setMessage(null);
    start(async () => {
      const r = await closeTheDay({
        date,
        cashCounted: (paiseFromText(counted) ?? 0),
        note: note || undefined,
      });
      if (r.error) {
        setMessage(r.error);
        return;
      }
      setMessage(
        r.variance === 0
          ? "Closed. The cash tallies exactly."
          : `Closed with a variance of ${formatMoney(r.variance ?? 0)} — recorded against your name.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 px-5 py-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="counted" className="eyebrow text-ink-3 mb-1 block">
            Cash counted in the drawer
          </label>
          <input
            id="counted"
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-right text-[15px] tnum outline-none focus:border-brand"
          />
        </div>
        <div className="pb-2 text-right">
          <p className="eyebrow text-ink-3">Expected</p>
          <p className="tnum text-[15px] font-semibold">{formatMoney(cashExpected)}</p>
        </div>
      </div>

      <div
        className={`rounded-md border px-3 py-2 text-[13px] ${
          variance === 0
            ? "border-good/25 bg-good-light text-good"
            : "border-overdue/25 bg-overdue-light text-overdue"
        }`}
      >
        {variance === 0
          ? "Tallies exactly."
          : `${variance > 0 ? "Excess" : "Short"} by ${formatMoney(Math.abs(variance))} — this will be recorded, not hidden.`}
      </div>

      <div>
        <label htmlFor="note" className="eyebrow text-ink-3 mb-1 block">
          Note (optional)
        </label>
        <input
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Explain any variance"
          className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
        />
      </div>

      <Button onClick={submit} disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
        {existing ? "Update the closeout" : "Close the day"}
      </Button>

      {message ? <p className="text-[12.5px] text-ink-2">{message}</p> : null}
    </div>
  );
}
