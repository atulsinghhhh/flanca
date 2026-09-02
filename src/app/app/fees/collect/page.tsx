import Link from "next/link";
import { CheckCircle2, Coins, QrCode, Search, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { isoDay } from "@/lib/queries/when";
import { requireRole, MONEY } from "@/lib/session";
import { getStudentFeePosition } from "@/lib/queries/fees";
import { formatMoney } from "@/lib/core/money";
import { Badge, Card, CardHead, Empty, PageHead, Stat } from "@/components/ui/primitives";
import { CollectForm } from "./collect-form";
import { PaymentHistory } from "../payment-history";

export const metadata = { title: "Fee counter — Flanca" };

export default async function CollectPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; q?: string }>;
}) {
  const actor = await requireRole(...MONEY);
  const { student: studentId, q } = await searchParams;
  const today = isoDay();

  // ── no student chosen yet: search
  if (!studentId) {
    const matches = q?.trim()
      ? await db.student.findMany({
          where: {
            schoolId: actor.schoolId,
            status: "ACTIVE",
            OR: [
              { name: { contains: q.trim(), mode: "insensitive" } },
              { admissionNumber: { contains: q.trim(), mode: "insensitive" } },
              { fatherName: { contains: q.trim(), mode: "insensitive" } },
              ...(/^\d{4,}$/.test(q.trim().replace(/\D/g, ""))
                ? [{ guardianPhone: { contains: q.trim().replace(/\D/g, "").slice(-10) } }]
                : []),
            ],
          },
          orderBy: [{ class: { sequenceOrder: "asc" } }, { name: "asc" }],
          take: 25,
          select: {
            id: true, name: true, admissionNumber: true, fatherName: true, guardianPhone: true,
            class: { select: { name: true } }, section: { select: { name: true } },
            invoices: {
              where: { status: { in: ["UNPAID", "PARTIAL"] } },
              select: { amount: true, paidAmount: true },
            },
          },
        })
      : [];

    return (
      <>
        <PageHead
          eyebrow="Money"
          title="Fee counter"
          sub="Find the student, take the money, hand over a printed receipt. Three steps, no navigation."
        />

        <Card className="mx-auto max-w-2xl">
          <CardHead title="Who is paying?" hint="Search by name, admission number, father's name or mobile." />
          <form method="get" className="px-5 py-5">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-3" />
              <input
                name="q"
                defaultValue={q ?? ""}
                autoFocus
                placeholder="Start typing a name or admission number"
                className="h-12 w-full rounded-md border border-line-2 bg-white pr-3 pl-10 text-[15.5px] outline-none focus:border-brand"
              />
            </div>
            <button
              type="submit"
              className="mt-3 h-11 w-full rounded-md bg-brand text-[15px] font-semibold text-white hover:bg-brand-dark"
            >
              Search
            </button>
          </form>

          {q?.trim() ? (
            matches.length === 0 ? (
              <Empty title={`No student matches “${q}”`} hint="Check the spelling, or search by admission number." />
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {matches.map((s) => {
                  const due = s.invoices.reduce((a, i) => a + (i.amount - i.paidAmount), 0);
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/app/fees/collect?student=${s.id}`}
                        className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-brand-light/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14.5px] font-semibold">{s.name}</p>
                          <p className="mt-0.5 text-[12.5px] text-ink-3">
                            {s.admissionNumber} · {s.class?.name ?? "—"}
                            {s.section ? ` ${s.section.name}` : ""}
                            {s.fatherName ? ` · ${s.fatherName}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {due > 0 ? (
                            <>
                              <p className="tnum text-[14.5px] font-semibold text-overdue">
                                {formatMoney(due)}
                              </p>
                              <p className="text-[11.5px] text-ink-3">due</p>
                            </>
                          ) : (
                            <Badge tone="good">
                              <CheckCircle2 className="size-3" /> Paid up
                            </Badge>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}
        </Card>
      </>
    );
  }

  // ── student chosen: collect
  const position = await getStudentFeePosition(actor.schoolId, studentId);
  if (!position) {
    return (
      <>
        <PageHead eyebrow="Money" title="Fee counter" />
        <Card>
          <Empty title="That student is not on this school's roll" />
        </Card>
      </>
    );
  }

  const { student, invoices, totalDue, totalFine, upi, payments } = position;
  const cls = `${student.class?.name ?? "—"}${student.section ? ` ${student.section.name}` : ""}`;

  // UPI intent: the parent scans and pays the school DIRECTLY. No aggregator in
  // the middle means no MDR and no convenience fee — the market's loudest complaint.
  const upiLink = upi
    ? `upi://pay?pa=${encodeURIComponent(upi.id)}&pn=${encodeURIComponent(upi.payee)}&am=${(totalDue / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Fee ${student.admissionNumber}`)}`
    : null;

  return (
    <>
      <PageHead
        eyebrow={`Fee counter · ${student.admissionNumber} · ${cls}`}
        title={student.name}
        sub={
          student.fatherName
            ? `Father: ${student.fatherName}${student.guardianPhone ? ` · ${student.guardianPhone}` : ""}`
            : undefined
        }
        actions={
          <Link
            href="/app/fees/collect"
            className="rounded-md border border-line-2 bg-white px-3 py-2 text-[13px] font-semibold hover:bg-paper-2"
          >
            Different student
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Outstanding"
          value={totalDue === 0 ? "Clear" : formatMoney(totalDue)}
          tone={totalDue > 0 ? "bad" : "good"}
          sub={`${invoices.length} open invoice${invoices.length === 1 ? "" : "s"}`}
          icon={<Coins className="size-4" />}
        />
        <Stat
          label="Late fee applicable"
          value={totalFine === 0 ? "None" : formatMoney(totalFine)}
          tone={totalFine > 0 ? "warn" : "good"}
          sub="Only charged if you tick it"
        />
        <Stat
          label="Concessions"
          value={student.concessions.length === 0 ? "None" : student.concessions.map((c) => c.concessionType.name).join(", ")}
          sub={student.concessions.length > 0 ? "Already applied to the invoices" : "No concession on record"}
        />
      </div>

      {invoices.length === 0 ? (
        <Card className="mt-5">
          <Empty
            title="Nothing outstanding"
            hint="Every invoice for this student is settled. Receipts stay available on the student's page."
          />
        </Card>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_300px]">
          <Card className="overflow-hidden">
            <CardHead
              title="What is owed"
              hint="Head-wise itemisation is printed on the receipt exactly as the invoice shows it."
            />
            <CollectForm
              studentId={student.id}
              today={today}
              invoices={invoices.map((i) => ({
                id: i.id,
                invoiceNumber: i.invoiceNumber,
                label: i.label,
                dueDate: i.dueDate.toISOString(),
                amount: i.amount,
                paidAmount: i.paidAmount,
                balance: i.balance,
                fine: i.fine,
                daysOverdue: i.daysOverdue,
              }))}
            />
          </Card>

          <div className="space-y-5">
            {upiLink ? (
              <Card>
                <CardHead title="Or let the parent pay by UPI" />
                <div className="px-5 py-4">
                  <div className="flex items-start gap-2.5 rounded-md border border-good/25 bg-good-light px-3 py-2.5">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" />
                    <p className="text-[12.5px] leading-snug text-good">
                      Paid straight to the school's UPI ID. <strong>₹0 convenience fee</strong> — no
                      aggregator, no gateway charge to the parent.
                    </p>
                  </div>
                  <dl className="mt-3 space-y-1.5 text-[13px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-3">UPI ID</dt>
                      <dd className="font-mono text-[12.5px] font-semibold">{upi!.id}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-3">Payee</dt>
                      <dd className="font-medium">{upi!.payee}</dd>
                    </div>
                    <div className="flex justify-between gap-2 border-t border-line pt-1.5">
                      <dt className="text-ink-3">Amount</dt>
                      <dd className="tnum font-semibold">{formatMoney(totalDue)}</dd>
                    </div>
                  </dl>
                  <a
                    href={upiLink}
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-line-2 bg-white px-3 py-2 text-[13px] font-semibold hover:bg-paper-2"
                  >
                    <QrCode className="size-4" /> Open UPI app
                  </a>
                  <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
                    Once it lands, record it here with mode “UPI” and the transaction id.
                  </p>
                </div>
              </Card>
            ) : null}

            {payments.length > 0 ? (
              <Card>
                <CardHead title="Recent receipts" />
                <PaymentHistory
                  canReverse
                  showReprint={false}
                  payments={payments.map((p) => ({
                    id: p.id,
                    amount: p.amount,
                    mode: p.mode,
                    paidAtLabel: p.paidAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
                    receiptId: p.receipt?.id ?? null,
                    receiptNumber: p.receipt?.receiptNumber ?? null,
                    reversedAt: p.reversedAt ? p.reversedAt.toISOString() : null,
                    reverseReason: p.reverseReason,
                  }))}
                />
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
