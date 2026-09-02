import Link from "next/link";
import { Banknote, Coins, Landmark, Printer, Wallet } from "lucide-react";
import { requireRole, MONEY } from "@/lib/session";
import { isoDay } from "@/lib/queries/when";
import { getDayBook } from "@/lib/queries/fees";
import { formatMoney } from "@/lib/core/money";
import { Badge, ButtonLink, Card, CardHead, Empty, PageHead, Stat } from "@/components/ui/primitives";
import { CloseoutForm } from "./closeout-form";

export const metadata = { title: "Day book — Flanca" };

const MODE_LABEL: Record<string, string> = {
  CASH: "Cash", UPI: "UPI", CHEQUE: "Cheque", CARD: "Card",
  NETBANKING: "Net banking", DD: "Demand draft", NEFT: "NEFT / IMPS", ADJUSTMENT: "Adjustment",
};

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const actor = await requireRole(...MONEY);
  const sp = await searchParams;

  const chosen = sp.date ? new Date(sp.date) : new Date();
  const date = Number.isNaN(chosen.getTime()) ? new Date() : chosen;
  const book = await getDayBook(actor.schoolId, date);
  const iso = isoDay(book.date);

  return (
    <>
      <PageHead
        eyebrow="Money"
        title="Day book"
        sub="Everything the counter took today, by mode, with a cash closeout an auditor can read."
        actions={
          <>
            <form method="get" className="flex items-center gap-2">
              <input
                type="date"
                name="date"
                defaultValue={iso}
                className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
              />
              <button className="h-9 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold hover:bg-paper-2">
                Go
              </button>
            </form>
            <ButtonLink href="/app/fees/collect" size="sm">
              <Coins className="size-4" /> Fee counter
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Collected"
          value={formatMoney(book.total)}
          tone={book.total > 0 ? "good" : "neutral"}
          sub={`${book.payments.length} receipt${book.payments.length === 1 ? "" : "s"} on ${book.date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`}
          icon={<Banknote className="size-4" />}
        />
        <Stat label="Cash" value={formatMoney(book.cash)} sub="to be counted at closing" icon={<Wallet className="size-4" />} />
        <Stat label="Cheque / DD" value={formatMoney(book.cheque)} sub="to be banked" />
        <Stat label="Online" value={formatMoney(book.online)} sub="UPI, card, net banking" icon={<Landmark className="size-4" />} />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <CardHead
            title="Receipts issued"
            hint="In receipt-number order. Nothing here can be deleted — a wrong entry is reversed and stays visible."
          />
          {book.payments.length === 0 ? (
            <Empty
              title="Nothing collected on this date"
              hint="Pick another date, or take a payment at the fee counter."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="ruled w-full min-w-[720px]">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Time</th>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Mode</th>
                    <th>Reference</th>
                    <th className="num">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {book.payments.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Receipt" className="font-mono text-[12px] whitespace-nowrap">
                        {p.receipt?.receiptNumber ?? "—"}
                      </td>
                      <td data-label="Time" className="whitespace-nowrap text-ink-2">
                        {p.paidAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                      </td>
                      <td data-title className="font-medium">{p.student.name}</td>
                      <td data-label="Class" className="whitespace-nowrap text-ink-2">
                        {p.student.class?.name ?? "—"}
                        {p.student.section ? ` ${p.student.section.name}` : ""}
                      </td>
                      <td data-label="Mode">
                        <Badge tone={p.mode === "CASH" ? "warn" : p.mode === "UPI" ? "good" : "neutral"}>
                          {MODE_LABEL[p.mode] ?? p.mode}
                        </Badge>
                      </td>
                      <td data-label="Reference" className="font-mono text-[11.5px] text-ink-3">{p.reference ?? "—"}</td>
                      <td data-label="Amount" className="num font-semibold">{formatMoney(p.amount)}</td>
                      <td data-label="">
                        {p.receipt ? (
                          <Link
                            href={`/app/fees/receipt?ids=${p.receipt.id}`}
                            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline"
                          >
                            <Printer className="size-3.5" /> Print
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line-2">
                    <td colSpan={6} className="px-3 py-2.5 text-right font-semibold">
                      Total
                    </td>
                    <td className="num px-3 py-2.5 text-[15px] font-bold">{formatMoney(book.total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHead title="By mode" />
            {book.byMode.length === 0 ? (
              <Empty title="Nothing to split" />
            ) : (
              <ul className="divide-y divide-line">
                {book.byMode.map((m) => (
                  <li key={m.mode} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div>
                      <p className="text-[13.5px] font-medium">{MODE_LABEL[m.mode] ?? m.mode}</p>
                      <p className="text-[11.5px] text-ink-3">
                        {m.count} receipt{m.count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <p className="tnum text-[14px] font-semibold">{formatMoney(m.amount)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead
              title="Cash closeout"
              hint="Count the drawer and record it. The variance is kept, not hidden."
              action={
                book.closeout ? (
                  <Badge tone={book.closeout.variance === 0 ? "good" : "bad"}>
                    {book.closeout.variance === 0
                      ? "Tallied"
                      : `${book.closeout.variance > 0 ? "Excess" : "Short"} ${formatMoney(Math.abs(book.closeout.variance))}`}
                  </Badge>
                ) : null
              }
            />
            <CloseoutForm
              date={iso}
              cashExpected={book.cash}
              existing={
                book.closeout
                  ? {
                      cashCounted: book.closeout.cashCounted,
                      variance: book.closeout.variance,
                      note: book.closeout.note,
                    }
                  : null
              }
            />
          </Card>
        </div>
      </div>
    </>
  );
}
