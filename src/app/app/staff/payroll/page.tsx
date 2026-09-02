import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { formatMoney, moneyInWords } from "@/lib/core/money";
import { monthLabel } from "@/lib/core/payroll-core";
import { Badge, Card, CardHead, Empty, PageHead, Stat } from "@/components/ui/primitives";
import { PrintButton } from "@/app/app/fees/receipt/print-button";
import { PayrollActions } from "./payroll-actions";

export const metadata = { title: "Salary register — Flanca" };

type Component = { label: string; amount: number };

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const actor = await requireRole(...OFFICE);
  const sp = await searchParams;

  const now = new Date();
  const [yearStr, monthStr] = (
    sp.month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  ).split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  const [rows, school] = await Promise.all([
    db.staffSalary.findMany({
      where: { schoolId: actor.schoolId, month, year },
      orderBy: { staff: { employeeId: "asc" } },
      include: { staff: { include: { user: { select: { name: true } } } } },
    }),
    db.school.findUnique({ where: { id: actor.schoolId }, select: { name: true, address: true } }),
  ]);

  const netTotal = rows.reduce((a, r) => a + r.netPay, 0);
  const paidCount = rows.filter((r) => r.paidAt).length;

  return (
    <>
      <div className="no-print">
        <Link
          href="/app/staff"
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" /> Staff
        </Link>

        <PageHead
          eyebrow="School"
          title="Salary register"
          sub="Built from staff attendance. Loss of pay is prorated on the basic only, so the accountant can reproduce every figure by hand."
          actions={
            <>
              <form method="get" className="flex items-center gap-2">
                <input
                  type="month"
                  name="month"
                  defaultValue={`${year}-${String(month).padStart(2, "0")}`}
                  className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
                />
                <button className="h-9 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold hover:bg-paper-2">
                  Show
                </button>
              </form>
              <PrintButton label="Print register" />
            </>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Staff on the register" value={rows.length} sub={monthLabel(month, year)} />
          <Stat label="Net payable" value={formatMoney(netTotal)} tone="warn" sub="after deductions" />
          <Stat
            label="Paid"
            value={`${paidCount} / ${rows.length}`}
            tone={paidCount === rows.length && rows.length > 0 ? "good" : "warn"}
          />
          <Stat
            label="Loss of pay"
            value={rows.filter((r) => (r.daysPayable ?? 0) > (r.daysPresent ?? 0)).length}
            sub="staff with an LOP day"
          />
        </div>

        <Card className="mt-5 px-5 py-4">
          <PayrollActions month={month} year={year} anyUnpaid={rows.some((r) => !r.paidAt)} />
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden print:border-0 print:shadow-none">
        <div className="hidden px-5 py-3 text-center print:block">
          <h2 className="font-display text-[16px] font-bold">{school?.name}</h2>
          <p className="text-[12px]">Salary Register — {monthLabel(month, year)}</p>
        </div>

        <div className="no-print">
          <CardHead
            title={monthLabel(month, year)}
            hint={rows.length > 0 ? `${rows.length} staff · ${formatMoney(netTotal)} net` : undefined}
          />
        </div>

        {rows.length === 0 ? (
          <Empty
            title="No register for this month yet"
            hint="Build it from staff attendance with the button above."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="ruled w-full min-w-[900px]">
              <thead>
                <tr>
                  <th>Emp. ID</th>
                  <th>Name</th>
                  <th className="num">Days</th>
                  <th className="num">Basic</th>
                  <th className="num">Allowances</th>
                  <th className="num">Deductions</th>
                  <th className="num">Net pay</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const allowances = (r.allowances ?? []) as Component[];
                  const deductions = (r.deductions ?? []) as Component[];
                  const allowTotal = allowances.reduce((a, c) => a + c.amount, 0);
                  const deductTotal = deductions.reduce((a, c) => a + c.amount, 0);
                  const lop = (r.daysPayable ?? 0) - (r.daysPresent ?? 0);

                  return (
                    <tr key={r.id}>
                      <td data-label="Emp. ID" className="font-mono text-[12px] whitespace-nowrap text-ink-2">
                        {r.staff.employeeId}
                      </td>
                      <td data-title className="font-medium">{r.staff.user.name}</td>
                      <td data-label="Days" className="num whitespace-nowrap">
                        {r.daysPresent ?? "—"}/{r.daysPayable ?? "—"}
                        {lop > 0 ? <span className="ml-1 text-[11px] text-overdue">−{lop}</span> : null}
                      </td>
                      <td data-label="Basic" className="num">{formatMoney(r.basic)}</td>
                      <td data-label="Allowances" className="num" title={allowances.map((a) => `${a.label} ${formatMoney(a.amount)}`).join(", ")}>
                        {formatMoney(allowTotal)}
                      </td>
                      <td data-label="Deductions" className="num" title={deductions.map((d) => `${d.label} ${formatMoney(d.amount)}`).join(", ")}>
                        {formatMoney(deductTotal)}
                      </td>
                      <td data-label="Net pay" className="num font-semibold">{formatMoney(r.netPay)}</td>
                      <td data-label="Status">
                        {r.paidAt ? (
                          <Badge tone="good">Paid {r.mode ?? ""}</Badge>
                        ) : (
                          <Badge tone="warn">Unpaid</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line-2">
                  <td colSpan={6} className="px-3 py-2.5 text-right font-semibold">
                    Total net payable
                  </td>
                  <td className="num px-3 py-2.5 text-[15px] font-bold">{formatMoney(netTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {rows.length > 0 ? (
          <p className="border-t border-line px-5 py-2.5 text-[12px] text-ink-2">
            <strong>In words:</strong> {moneyInWords(netTotal)}
          </p>
        ) : null}

        <div className="hidden justify-between px-5 pt-10 pb-4 print:flex">
          <div className="text-center">
            <div className="mb-1 h-8 w-40 border-b border-ink" />
            <p className="text-[10.5px]">Accountant</p>
          </div>
          <div className="text-center">
            <div className="mb-1 h-8 w-40 border-b border-ink" />
            <p className="text-[10.5px]">Principal</p>
          </div>
        </div>
      </Card>
    </>
  );
}
