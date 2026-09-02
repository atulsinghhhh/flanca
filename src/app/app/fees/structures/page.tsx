import Link from "next/link";
import { Percent, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, MONEY } from "@/lib/session";
import { formatMoney } from "@/lib/core/money";
import { splitEvenly } from "@/lib/core/fees-core";
import { canDeleteFeeHead } from "@/lib/core/setup-core";
import { Badge, Card, CardHead, Empty, PageHead, Stat } from "@/components/ui/primitives";
import { FeeGrid, FeeHeadsEditor } from "./structure-editor";
import type { ClassFeeRow, HeadRow, TermRow } from "./structure-editor";

export const metadata = { title: "Fee structure — Flanca" };

export default async function StructuresPage() {
  const actor = await requireRole(...MONEY);

  const year = await db.academicYear.findFirst({
    where: { schoolId: actor.schoolId, isCurrent: true },
    select: { id: true, name: true },
  });

  const [heads, classes, structures, installments, concessions, finePolicy] = await Promise.all([
    db.feeHead.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: [{ sequenceOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { items: true } } },
    }),
    db.class.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { sequenceOrder: "asc" },
      select: { id: true, name: true, _count: { select: { students: true } } },
    }),
    db.feeStructure.findMany({
      where: { schoolId: actor.schoolId, isActive: true, ...(year ? { academicYearId: year.id } : {}) },
      select: { classId: true, items: { select: { feeHeadId: true, amount: true } } },
    }),
    year
      ? db.installmentPlan.findMany({
          where: {
            schoolId: actor.schoolId,
            feeStructure: { academicYearId: year.id, isActive: true },
          },
          orderBy: [{ sequenceOrder: "asc" }, { dueDate: "asc" }],
          select: { label: true, dueDate: true, _count: { select: { invoices: true } } },
        })
      : Promise.resolve([]),
    db.concessionType.findMany({
      where: { schoolId: actor.schoolId },
      include: { _count: { select: { concessions: true } } },
    }),
    db.lateFinePolicy.findFirst({ where: { schoolId: actor.schoolId, isActive: true } }),
  ]);

  // One row per term, gathering every class's copy of it — the schema keeps an
  // installment per class, but a school has one Term 2.
  const byLabel = new Map<string, { dates: string[]; classes: number; invoices: number }>();
  for (const i of installments) {
    const at = byLabel.get(i.label) ?? { dates: [], classes: 0, invoices: 0 };
    at.dates.push(i.dueDate.toISOString().slice(0, 10));
    at.classes += 1;
    at.invoices += i._count.invoices;
    byLabel.set(i.label, at);
  }
  const terms: TermRow[] = [...byLabel.entries()].map(([label, at]) => ({
    label,
    dueDate: at.dates.sort()[0],
    classes: at.classes,
    mixed: new Set(at.dates).size > 1,
    invoices: at.invoices,
  }));

  const headRows: HeadRow[] = heads.map((h) => {
    const check = canDeleteFeeHead({ items: h._count.items });
    return {
      id: h.id,
      name: h.name,
      code: h.code,
      isOptional: h.isOptional,
      isRefundable: h.isRefundable,
      classesCharging: h._count.items,
      removable: check.allowed,
      whyNot: check.reason,
    };
  });

  const amountsByClass = new Map<string, Record<string, number>>();
  for (const s of structures) {
    if (!s.classId) continue;
    const at = amountsByClass.get(s.classId) ?? {};
    for (const i of s.items) at[i.feeHeadId] = (at[i.feeHeadId] ?? 0) + i.amount;
    amountsByClass.set(s.classId, at);
  }

  const termCount = terms.length;
  const rows: ClassFeeRow[] = classes.map((c) => {
    const amounts = amountsByClass.get(c.id) ?? {};
    const total = Object.values(amounts).reduce((a, n) => a + n, 0);
    return {
      classId: c.id,
      className: c.name,
      students: c._count.students,
      amounts,
      total,
      // With no terms there is no per-term amount. Showing the annual fee here
      // would read as "this class pays ₹26,000 a term", which is four times the truth.
      perTerm: termCount > 0 ? splitEvenly(total, termCount)[0] : null,
    };
  });

  const annualTotal = rows.reduce((a, r) => a + r.total, 0);
  const unpriced = rows.filter((r) => r.total === 0).length;

  return (
    <>
      <PageHead
        eyebrow="Money"
        title="Fee structure"
        sub={`Annual fees by class for ${year?.name ?? "the current year"}, split into terms. Every head here becomes its own line on the parent's invoice — nothing is bundled into a vague "miscellaneous".`}
      />

      {!year ? (
        <Card className="mt-5">
          <Empty
            title="No current academic year"
            hint="Fees are priced for a year. Mark one as current before setting them."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Fee heads" value={heads.length} sub="each itemised on the invoice" />
            <Stat
              label="Classes priced"
              value={`${rows.length - unpriced}/${rows.length}`}
              sub={unpriced === 0 ? "every class has fees" : `${unpriced} still at zero`}
            />
            <Stat label="Terms" value={termCount || "—"} sub={termCount ? "per year" : "not configured"} />
            <Stat
              label="Concession types"
              value={concessions.length}
              sub={`${concessions.reduce((a, c) => a + c._count.concessions, 0)} students on a concession`}
            />
          </div>

          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 space-y-5">
              {heads.length === 0 ? (
                <Card>
                  <Empty
                    title="No fee heads yet"
                    hint="Start with what the school charges for — Tuition Fee, Examination Fee, Transport. Then price them per class."
                  />
                </Card>
              ) : (
                <FeeGrid heads={headRows} rows={rows} terms={termCount} />
              )}
              <FeeHeadsEditor heads={headRows} />
            </div>

            <div className="space-y-5">
              <Card>
                <CardHead
                  title="Terms"
                  hint="Set on the academic year, because a term belongs to the year rather than to the fees"
                  action={
                    <Link href="/app/settings/year" className="text-[13px] font-semibold text-brand hover:underline">
                      Edit
                    </Link>
                  }
                />
                {terms.length === 0 ? (
                  <Empty
                    title="No terms yet"
                    hint="Fees are billed one term at a time. Split the year into terms on the academic year screen."
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {terms.map((t) => (
                      <li key={t.label} className="flex items-center justify-between gap-3 px-5 py-2.5">
                        <div>
                          <p className="text-[13.5px] font-medium">{t.label}</p>
                          <p className="text-[11.5px] text-ink-3">
                            {t.mixed ? "Classes disagree — earliest " : "Due "}
                            {new Date(`${t.dueDate}T00:00:00Z`).toLocaleDateString("en-IN", {
                              day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
                            })}
                            {t.invoices > 0 ? ` · ${t.invoices.toLocaleString("en-IN")} raised` : ""}
                          </p>
                        </div>
                        <Badge tone="neutral">{formatMoney(Math.round(annualTotal / (termCount || 1)))}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHead
                  title="Concessions"
                  hint="Its own line on the invoice, never hidden in the total"
                  action={
                    <Link href="/app/fees/concessions" className="text-[13px] font-semibold text-brand hover:underline">
                      Edit
                    </Link>
                  }
                />
                {concessions.length === 0 ? (
                  <Empty title="No concession types" />
                ) : (
                  <ul className="divide-y divide-line">
                    {concessions.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                        <div>
                          <p className="text-[13.5px] font-medium">{c.name}</p>
                          <p className="text-[11.5px] text-ink-3">
                            {c._count.concessions} student{c._count.concessions === 1 ? "" : "s"}
                          </p>
                        </div>
                        <Badge tone="brand">
                          <Percent className="size-3" />
                          {c.percentage ? `${c.percentage}%` : formatMoney(c.fixedAmount ?? 0)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHead
                  title="Late fee policy"
                  hint="Applied only when the counter ticks it"
                  action={
                    <Link href="/app/fees/concessions" className="text-[13px] font-semibold text-brand hover:underline">
                      Edit
                    </Link>
                  }
                />
                {finePolicy ? (
                  <dl className="divide-y divide-line">
                    <Field label="Grace period" value={`${finePolicy.graceDays} days after due date`} />
                    <Field label="Flat charge" value={formatMoney(finePolicy.flatAmount)} />
                    <Field label="Per day" value={formatMoney(finePolicy.perDayAmount)} />
                    <Field
                      label="Maximum"
                      value={finePolicy.maxAmount ? formatMoney(finePolicy.maxAmount) : "No cap"}
                    />
                  </dl>
                ) : (
                  <Empty title="No late fee configured" hint="Nothing extra is ever charged." />
                )}
                <div className="flex items-start gap-2.5 border-t border-line bg-good-light/60 px-5 py-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" />
                  <p className="text-[12px] leading-snug text-good">
                    A late fee can never exceed the amount owed, and the counter must tick it deliberately —
                    it is never applied silently.
                  </p>
                </div>
              </Card>

              <p className="px-1 text-[12px] leading-relaxed text-ink-3">
                {formatMoney(annualTotal)} is the sum of every class's annual fee, not what the school
                expects to collect — that depends on how many children are in each class, and on
                concessions.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 px-5 py-2">
      <dt className="text-[12.5px] text-ink-3">{label}</dt>
      <dd className="text-[13px] font-medium">{value}</dd>
    </div>
  );
}
