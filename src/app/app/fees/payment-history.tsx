"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Printer, RotateCcw } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/core/money";
import { reversePayment } from "./actions";

export type PaymentRow = {
  id: string;
  amount: number;
  mode: string;
  paidAtLabel: string;
  receiptId: string | null;
  receiptNumber: string | null;
  reversedAt: string | null;
  reverseReason: string | null;
};

const INPUT =
  "h-8 w-full max-w-[240px] rounded-md border border-line-2 bg-white px-2 text-[13px] outline-none focus:border-brand";

/**
 * A student's receipts, with a way to undo one.
 *
 * `reversePayment` only ever filters reversed payments out of the lists that
 * feed this page, so a payment that was just reversed here would otherwise
 * vanish the moment the server data refreshes — indistinguishable from a
 * payment that never existed. The local override below keeps it on screen,
 * struck through and labelled, until the page is next opened fresh.
 */
export function PaymentHistory({
  payments,
  canReverse,
  showReprint,
}: {
  payments: PaymentRow[];
  canReverse: boolean;
  showReprint: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { reversedAt: string; reverseReason: string }>>({});

  useEffect(() => {
    setOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (payments.find((p) => p.id === id)?.reversedAt) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [payments]);

  function submitReversal(p: PaymentRow) {
    setError(null);
    start(async () => {
      const r = await reversePayment(p.id, reason);
      if (r.error) {
        setError(r.error);
        return;
      }
      setOverrides((prev) => ({ ...prev, [p.id]: { reversedAt: new Date().toISOString(), reverseReason: reason.trim() } }));
      setReversingId(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <ul className="divide-y divide-line">
      {payments.map((p) => {
        const reversed = p.reversedAt
          ? { reversedAt: p.reversedAt, reverseReason: p.reverseReason ?? "" }
          : overrides[p.id] ?? null;

        return (
          <li key={p.id} className="px-5 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <span className="font-mono text-[12px] text-ink-3">{p.receiptNumber ?? "—"}</span>
              <span className={`tnum font-semibold ${reversed ? "text-ink-3 line-through" : ""}`}>
                {formatMoney(p.amount)}
              </span>
              <span className="text-ink-3">{p.mode}</span>
              <span className="text-ink-3">{p.paidAtLabel}</span>
              {reversed ? <Badge tone="bad">Reversed</Badge> : null}
              <span className="ml-auto flex items-center gap-2.5">
                {showReprint && p.receiptId && !reversed ? (
                  <Link
                    href={`/app/fees/receipt/${p.receiptId}`}
                    className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline"
                  >
                    <Printer className="size-3.5" /> Reprint
                  </Link>
                ) : null}
                {canReverse && !reversed ? (
                  <button
                    onClick={() => {
                      setReversingId(reversingId === p.id ? null : p.id);
                      setReason("");
                      setError(null);
                    }}
                    className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-3 hover:text-overdue"
                  >
                    <RotateCcw className="size-3.5" /> Reverse
                  </button>
                ) : null}
              </span>
            </div>

            {reversed ? (
              <p className="mt-1 text-[12px] text-ink-3">Reversed: {reversed.reverseReason || "—"}</p>
            ) : null}

            {reversingId === p.id ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why — the family will ask, and it goes to the audit log"
                  className={INPUT}
                />
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending || !reason.trim()}
                  onClick={() => submitReversal(p)}
                >
                  {pending ? <Loader2 className="size-3.5 animate-spin" /> : null} Confirm reversal
                </Button>
                <button onClick={() => setReversingId(null)} className="text-[12px] text-ink-3 hover:text-ink">
                  Back
                </button>
                {error ? <p className="w-full text-[12px] text-overdue">{error}</p> : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
