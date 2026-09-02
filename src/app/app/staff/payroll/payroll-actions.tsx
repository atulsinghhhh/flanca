"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeIndianRupee, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/core/money";
import { generatePayroll, markSalariesPaid } from "../actions";

export function PayrollActions({
  month,
  year,
  anyUnpaid,
}: {
  month: number;
  year: number;
  anyUnpaid: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok?: boolean; error?: string; written?: number; total?: number; count?: number }>, describe: (r: { written?: number; total?: number; count?: number }) => string) {
    setMessage(null);
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.error) {
        setError(r.error);
        return;
      }
      setMessage(describe(r));
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            run(
              () => generatePayroll({ month, year }),
              (r) => `Register built for ${r.written} staff — ${formatMoney(r.total ?? 0)} net.`,
            )
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
          Build / rebuild register
        </Button>

        {anyUnpaid ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => markSalariesPaid({ month, year, mode: "NEFT" }),
                (r) => `${r.count} salaries marked paid by NEFT.`,
              )
            }
          >
            <BadgeIndianRupee className="size-4" /> Mark all paid (NEFT)
          </Button>
        ) : null}
      </div>

      <p className="text-[12px] text-ink-3">
        Rebuilding is safe — it updates the same rows rather than creating duplicates, so an attendance
        correction can simply be re-run.
      </p>

      {message ? <p className="text-[12.5px] text-good">{message}</p> : null}
      {error ? <p className="text-[12.5px] text-overdue">{error}</p> : null}
    </div>
  );
}
