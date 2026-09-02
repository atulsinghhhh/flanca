import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { canDeleteTerm, canDeleteYear } from "@/lib/core/year-core";
import { PageHead } from "@/components/ui/primitives";
import { TermEditor, YearEditor } from "./year-editor";
import type { TermRow, YearRow } from "./year-editor";

export const metadata = { title: "The academic year — Flanca" };

/**
 * The year and its terms.
 *
 * First thing a new school sets, and the thing everything else hangs off: a fee
 * structure, an invoice, an exam term and a report card all belong to a year. Until
 * this screen existed the seed was the only thing that had ever created one.
 */
export default async function YearPage() {
  const actor = await requireRole(...OFFICE);

  const years = await db.academicYear.findMany({
    where: { schoolId: actor.schoolId },
    orderBy: { startDate: "desc" },
    select: {
      id: true, name: true, startDate: true, endDate: true, isCurrent: true,
      _count: { select: { invoices: true, structures: true, examTerms: true, enrollments: true } },
    },
  });

  const current = years.find((y) => y.isCurrent) ?? null;

  const structures = current
    ? await db.feeStructure.findMany({
        where: { schoolId: actor.schoolId, academicYearId: current.id, isActive: true },
        select: { id: true },
      })
    : [];

  const plans = structures.length
    ? await db.installmentPlan.findMany({
        where: { schoolId: actor.schoolId, feeStructureId: { in: structures.map((s) => s.id) } },
        orderBy: [{ sequenceOrder: "asc" }, { dueDate: "asc" }],
        select: { label: true, dueDate: true, _count: { select: { invoices: true } } },
      })
    : [];

  const yearRows: YearRow[] = years.map((y) => {
    const check = canDeleteYear({
      invoices: y._count.invoices,
      structures: y._count.structures,
      examTerms: y._count.examTerms,
      enrollments: y._count.enrollments,
      isCurrent: y.isCurrent,
    });
    return {
      id: y.id,
      name: y.name,
      startDate: y.startDate.toISOString().slice(0, 10),
      endDate: y.endDate.toISOString().slice(0, 10),
      isCurrent: y.isCurrent,
      invoices: y._count.invoices,
      structures: y._count.structures,
      removable: check.allowed,
      whyNot: check.reason,
    };
  });

  // One row per term, gathering every class's copy of it.
  const byLabel = new Map<string, { dates: string[]; classes: number; invoices: number }>();
  for (const p of plans) {
    const at = byLabel.get(p.label) ?? { dates: [], classes: 0, invoices: 0 };
    at.dates.push(p.dueDate.toISOString().slice(0, 10));
    at.classes += 1;
    at.invoices += p._count.invoices;
    byLabel.set(p.label, at);
  }
  const termRows: TermRow[] = [...byLabel.entries()].map(([label, at]) => {
    const check = canDeleteTerm({ invoices: at.invoices });
    return {
      label,
      dueDate: at.dates.sort()[0],
      classes: at.classes,
      mixed: new Set(at.dates).size > 1,
      invoices: at.invoices,
      removable: check.allowed,
      whyNot: check.reason,
    };
  });

  const whyNotYet = !current
    ? "Make a year current above, and its terms can be set here."
    : structures.length === 0
      ? "No class has fees yet, and in the schema a term hangs off a class's fee structure — so terms can only be set once at least one class is priced. Set the fee amounts first and come back."
      : null;

  return (
    <>
      <Link
        href="/app/settings"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> School settings
      </Link>

      <PageHead
        eyebrow="School"
        title="The academic year"
        sub="The year the school is in, and the terms it bills in. Everything else — fees, exams, report cards — belongs to a year, which is why this is the first thing to set."
      />

      <div className="mt-1 grid items-start gap-5 lg:grid-cols-2">
        <YearEditor years={yearRows} />
        <div className="space-y-5">
          {/* Keyed on the year: switching year is a different context, and an error
              banner about last year's Term 1 must not outlive it. */}
          <TermEditor
            key={current?.id ?? "no-year"}
            terms={termRows}
            yearName={current?.name ?? null}
            canHaveTerms={Boolean(current) && structures.length > 0}
            whyNotYet={whyNotYet}
          />
          <div className="flex items-start gap-2.5 rounded-lg border border-line bg-white px-4 py-3">
            <Info className="mt-0.5 size-4 shrink-0 text-ink-3" />
            <p className="text-[13px] leading-relaxed text-ink-2">
              Changing the current year does not move anybody: children stay in their class, and last year's
              invoices and report cards stay where they are.{" "}
              <Link href="/app/fees/structures" className="font-semibold text-brand hover:underline">
                Fee amounts
              </Link>{" "}
              and{" "}
              <Link href="/app/fees/raise" className="font-semibold text-brand hover:underline">
                raising invoices
              </Link>{" "}
              both follow the current year.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
