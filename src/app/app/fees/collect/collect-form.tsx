"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Loader2, Printer } from "lucide-react";
import type { PaymentMode } from "@prisma/client";
import { Button } from "@/components/ui/primitives";
import { formatMoney, moneyInWords, paiseFromText } from "@/lib/core/money";
import { collectPayment } from "../actions";

type Invoice = {
  id: string;
  invoiceNumber: string;
  label: string | null;
  dueDate: string;
  amount: number;
  paidAmount: number;
  balance: number;
  fine: number;
  daysOverdue: number;
};

const MODES: Array<{ value: PaymentMode; label: string; needsRef?: boolean }> = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CHEQUE", label: "Cheque", needsRef: true },
  { value: "CARD", label: "Card" },
  { value: "NETBANKING", label: "Net banking" },
  { value: "DD", label: "Demand draft", needsRef: true },
  { value: "NEFT", label: "NEFT / IMPS" },
];

export function CollectForm({
  studentId,
  invoices,
  today,
}: {
  studentId: string;
  invoices: Invoice[];
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Default: collect every rupee outstanding. The counter clerk's normal case is
  // "pay it all", so it should need zero typing.
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(invoices.map((i) => [i.id, String(i.balance / 100)])),
  );
  const [fines, setFines] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [reference, setReference] = useState("");
  const [bankName, setBankName] = useState("");
  const [paidAt, setPaidAt] = useState(today);

  const total = useMemo(
    () =>
      invoices.reduce((sum, inv) => {
        const entered = paiseFromText(amounts[inv.id]) ?? 0;
        const fine = fines[inv.id] ? inv.fine : 0;
        return sum + entered + fine;
      }, 0),
    [amounts, fines, invoices],
  );

  const needsRef = MODES.find((m) => m.value === mode)?.needsRef ?? false;

  function setAll(kind: "full" | "clear") {
    setAmounts(
      Object.fromEntries(
        invoices.map((i) => [i.id, kind === "full" ? String(i.balance / 100) : "0"]),
      ),
    );
  }

  function submit() {
    setError(null);
    start(async () => {
      const result = await collectPayment({
        studentId,
        mode,
        reference: reference || undefined,
        bankName: bankName || undefined,
        paidAt,
        allocations: invoices
          .map((inv) => ({
            invoiceId: inv.id,
            amount: paiseFromText(amounts[inv.id]) ?? 0,
            lateFee: fines[inv.id] ? inv.fine : 0,
          }))
          .filter((a) => a.amount > 0 || (a.lateFee ?? 0) > 0),
      });

      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/app/fees/receipt?ids=${(result.receiptIds ?? []).join(",")}`);
    });
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="ruled w-full min-w-[680px]">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Term</th>
              <th>Due</th>
              <th className="num">Balance</th>
              <th className="num">Late fee</th>
              <th className="num w-36">Collect now</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td data-title className="font-mono text-[12px] whitespace-nowrap text-ink-2">{inv.invoiceNumber}</td>
                <td data-label="Term" className="whitespace-nowrap">{inv.label ?? "—"}</td>
                <td data-label="Due" className={`whitespace-nowrap ${inv.daysOverdue > 0 ? "text-overdue" : "text-ink-2"}`}>
                  {new Date(inv.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  {inv.daysOverdue > 0 ? (
                    <span className="ml-1 text-[11.5px]">({inv.daysOverdue}d late)</span>
                  ) : null}
                </td>
                <td data-label="Balance" className="num font-semibold">{formatMoney(inv.balance)}</td>
                <td data-label="Late fee" className="num">
                  {inv.fine > 0 ? (
                    <label className="inline-flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={Boolean(fines[inv.id])}
                        onChange={(e) => setFines((f) => ({ ...f, [inv.id]: e.target.checked }))}
                        className="size-3.5 accent-[var(--color-brand)]"
                      />
                      <span className={fines[inv.id] ? "font-semibold text-overdue" : "text-ink-3"}>
                        {formatMoney(inv.fine)}
                      </span>
                    </label>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </td>
                <td data-label="Collect now" className="num">
                  <input
                    inputMode="decimal"
                    value={amounts[inv.id] ?? ""}
                    onChange={(e) => setAmounts((a) => ({ ...a, [inv.id]: e.target.value }))}
                    className="h-9 w-32 rounded-md border border-line-2 bg-white px-2 text-right text-[14px] tnum outline-none focus:border-brand"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-2.5">
        <button onClick={() => setAll("full")} className="text-[12.5px] font-semibold text-brand hover:underline">
          Collect everything
        </button>
        <span className="text-ink-3">·</span>
        <button onClick={() => setAll("clear")} className="text-[12.5px] font-semibold text-ink-3 hover:text-ink">
          Clear all
        </button>
        <p className="ml-auto text-[12.5px] text-ink-3">
          Part payments are allowed — enter any amount.
        </p>
      </div>

      {/* ── how the money arrived ── */}
      <div className="grid gap-4 border-t border-line px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="mode" className="eyebrow text-ink-3 mb-1 block">
            Payment mode
          </label>
          <select
            id="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as PaymentMode)}
            className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="reference" className="eyebrow text-ink-3 mb-1 block">
            {needsRef ? "Cheque / DD no *" : "Reference"}
          </label>
          <input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={mode === "UPI" ? "UPI txn id" : needsRef ? "Required" : "Optional"}
            className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor="bank" className="eyebrow text-ink-3 mb-1 block">
            Bank
          </label>
          <input
            id="bank"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="Optional"
            className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor="paidAt" className="eyebrow text-ink-3 mb-1 block">
            Payment date
          </label>
          <input
            id="paidAt"
            type="date"
            value={paidAt}
            max={today}
            onChange={(e) => setPaidAt(e.target.value)}
            className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
          />
        </div>
      </div>

      {/* ── the total, in figures and in words, like a receipt book ── */}
      <div className="border-t border-line bg-paper-2/60 px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-ink-3">Total to collect</p>
            <p className="mt-0.5 font-display text-[30px] leading-none font-semibold tnum">
              {formatMoney(total)}
            </p>
            {total > 0 ? (
              <p className="mt-1 text-[12.5px] text-ink-3">{moneyInWords(total)}</p>
            ) : null}
          </div>

          <div className="flex flex-col items-end gap-2">
            {error ? (
              <p className="max-w-sm rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13px] text-overdue">
                {error}
              </p>
            ) : null}
            <Button size="lg" onClick={submit} disabled={pending || total <= 0}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Banknote className="size-4" />}
              {pending ? "Recording…" : "Take payment & print receipt"}
            </Button>
            <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
              <Printer className="size-3.5" /> A gap-free receipt number is issued automatically
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
