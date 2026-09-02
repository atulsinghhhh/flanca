"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Receipt, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { raiseTermInvoices } from "./actions";

/**
 * Two clicks, deliberately.
 *
 * The first click asks the question in full — how many families, how much money —
 * and the second does it. A button that bills 800 people on one click is a button
 * somebody will press by accident.
 */
export function RaiseForm({
  label,
  count,
  netText,
  disabledReason,
}: {
  label: string;
  count: number;
  netText: string;
  disabledReason: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (disabledReason) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-line bg-paper-2/60 px-4 py-3 text-[13.5px] text-ink-2">
        <CheckCircle2 className="size-4 shrink-0 text-good" /> {disabledReason}
      </p>
    );
  }

  if (done) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-good/25 bg-good-light px-4 py-3 text-[13.5px] font-medium text-good">
        <CheckCircle2 className="size-4 shrink-0" /> {done}
      </p>
    );
  }

  return (
    <div>
      {error ? (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-overdue/25 bg-overdue-light px-4 py-3 text-[13.5px] text-overdue">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      ) : null}

      {asking ? (
        <div className="rounded-lg border border-marigold/35 bg-marigold-light/60 px-4 py-3.5">
          <p className="text-[14px] font-semibold text-ink">
            Raise {count} invoices for {label}, {netText} in all?
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
            Every one of those families will owe money from the moment you do this. Invoices cannot be
            deleted afterwards — a wrong one is cancelled, and the cancellation stays on the record.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await raiseTermInvoices({ label, expectedCount: count });
                  if (r.error) {
                    setError(r.error);
                    setAsking(false);
                    return;
                  }
                  setDone(`${r.raised} invoices raised for ${label}.`);
                  setAsking(false);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />}
              Yes, raise {count} invoices
            </Button>
            <button
              onClick={() => setAsking(false)}
              disabled={pending}
              className="text-[13.5px] font-semibold text-ink-2 hover:text-ink"
            >
              Not now
            </button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setAsking(true)}>
          <Receipt className="size-4" /> Raise {count} invoices for {label}
        </Button>
      )}
    </div>
  );
}
