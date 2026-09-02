import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, MONEY } from "@/lib/session";
import { ReceiptSheet, type ReceiptSnapshot } from "@/components/print/receipt-sheet";
import { Card, Empty } from "@/components/ui/primitives";
import { PrintButton } from "./print-button";

export const metadata = { title: "Receipt — Flanca" };

/**
 * One transaction can settle several invoices, so this page prints every receipt
 * it produced as one document — school copy and parent copy for each.
 */
export default async function ReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const actor = await requireRole(...MONEY);
  const { ids } = await searchParams;
  const idList = (ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const [receipts, school] = await Promise.all([
    idList.length
      ? db.receipt.findMany({
          where: { id: { in: idList }, schoolId: actor.schoolId },
          orderBy: { receiptNumber: "asc" },
          include: { payment: { include: { student: { select: { id: true, name: true } } } } },
        })
      : [],
    db.school.findUnique({
      where: { id: actor.schoolId },
      select: { name: true, address: true, phone: true, email: true, affiliationNo: true, udiseCode: true },
    }),
  ]);

  if (receipts.length === 0 || !school) {
    return (
      <Card>
        <Empty title="Receipt not found" hint="It may have been issued at another school, or the link is wrong." />
      </Card>
    );
  }

  const studentId = receipts[0].payment.student.id;
  const total = receipts.reduce((a, r) => a + r.payment.amount, 0);

  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/app/students/${studentId}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
          >
            <ArrowLeft className="size-3.5" /> {receipts[0].payment.student.name}
          </Link>
          <p className="mt-1 text-[13.5px] text-ink-2">
            {receipts.length} receipt{receipts.length === 1 ? "" : "s"} issued ·{" "}
            {receipts.map((r) => r.receiptNumber).join(", ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/app/fees/collect"
            className="rounded-md border border-line-2 bg-white px-3 py-2 text-[13px] font-semibold hover:bg-paper-2"
          >
            Next payment
          </Link>
          <PrintButton label={receipts.length > 1 ? "Print all receipts" : "Print receipt"} />
        </div>
      </div>

      <div className="space-y-6">
        {receipts.map((r) =>
          (["Parent copy", "School copy"] as const).map((copy) => (
            <div key={`${r.id}-${copy}`} className="card overflow-hidden print:border-0 print:shadow-none page-break">
              <ReceiptSheet
                school={school}
                receiptNumber={r.receiptNumber}
                issuedAt={r.issuedAt}
                snapshot={r.snapshot as ReceiptSnapshot}
                copyLabel={copy}
              />
            </div>
          )),
        )}
      </div>

      {receipts.length > 1 ? (
        <p className="no-print mt-4 text-center text-[13px] text-ink-3">
          Total collected in this transaction: <strong>{(total / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}</strong>
        </p>
      ) : null}
    </>
  );
}
