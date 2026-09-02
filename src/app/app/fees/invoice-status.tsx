"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Badge, Button, type Tone } from "@/components/ui/primitives";
import { cancelInvoice } from "./actions";

const INVOICE_TONE: Record<string, Tone> = {
  PAID: "good",
  PARTIAL: "warn",
  UNPAID: "neutral",
  DRAFT: "neutral",
  CANCELLED: "neutral",
};

function title(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

const INPUT = "h-7 w-40 rounded-md border border-line-2 bg-white px-1.5 text-[12px] outline-none focus:border-brand";

/**
 * An invoice's status, with a way to cancel a wrongly-raised one.
 *
 * `getStudent` only ever fetches invoices that are not already CANCELLED, so a
 * cancellation done here would otherwise make the row disappear on the next
 * refresh instead of showing what happened to it. The local override keeps it
 * visible, marked cancelled with its reason, until the page is next opened fresh.
 */
export function InvoiceStatusCell({
  invoiceId,
  status,
  paidAmount,
  cancelReason,
  canCancel,
}: {
  invoiceId: string;
  status: string;
  paidAmount: number;
  cancelReason: string | null;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [override, setOverride] = useState<{ status: string; reason: string } | null>(null);

  const current = override ?? { status, reason: cancelReason ?? "" };
  const cancellable = canCancel && current.status !== "CANCELLED" && current.status !== "PAID" && paidAmount === 0;

  function confirmCancel() {
    setError(null);
    start(async () => {
      const r = await cancelInvoice(invoiceId, reason);
      if (r.error) {
        setError(r.error);
        return;
      }
      setOverride({ status: "CANCELLED", reason: reason.trim() });
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div>
      <Badge tone={INVOICE_TONE[current.status] ?? "neutral"}>{title(current.status)}</Badge>
      {current.status === "CANCELLED" && current.reason ? (
        <p className="mt-1 text-[11px] text-ink-3">{current.reason}</p>
      ) : null}

      {cancellable ? (
        open ? (
          <div className="mt-1.5 flex flex-col items-start gap-1.5">
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why — required"
              className={INPUT}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="danger" disabled={pending || !reason.trim()} onClick={confirmCancel}>
                {pending ? <Loader2 className="size-3 animate-spin" /> : null} Confirm
              </Button>
              <button onClick={() => setOpen(false)} className="text-[11px] text-ink-3 hover:text-ink">
                Back
              </button>
            </div>
            {error ? <p className="text-[11px] text-overdue">{error}</p> : null}
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="mt-1 block text-[11px] font-semibold text-ink-3 hover:text-overdue"
          >
            Cancel invoice
          </button>
        )
      ) : null}
    </div>
  );
}
