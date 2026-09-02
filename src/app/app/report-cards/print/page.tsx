import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { ReportCardSheet, type CardSnapshot } from "@/components/print/report-card-sheet";
import { Card, Empty } from "@/components/ui/primitives";
import { PrintButton } from "@/app/app/fees/receipt/print-button";

export const metadata = { title: "Print report cards — Flanca" };

/** A whole class in one print job — the "one action per class" contract. */
export default async function PrintReportCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const actor = await requireActor();
  const { term } = await searchParams;

  const [school, year, cards] = await Promise.all([
    db.school.findUnique({
      where: { id: actor.schoolId },
      select: { name: true, address: true, phone: true, email: true, affiliationNo: true, udiseCode: true },
    }),
    db.academicYear.findFirst({ where: { schoolId: actor.schoolId, isCurrent: true } }),
    term
      ? db.reportCard.findMany({
          where: { schoolId: actor.schoolId, examTermId: term },
          orderBy: [{ section: { name: "asc" } }, { student: { rollNumber: "asc" } }],
          include: {
            student: {
              select: {
                name: true, admissionNumber: true, rollNumber: true,
                fatherName: true, motherName: true, dob: true, apaarId: true,
              },
            },
            examTerm: { select: { name: true } },
            class: { select: { name: true } },
            section: { select: { name: true } },
          },
        })
      : [],
  ]);

  if (!school || cards.length === 0) {
    return (
      <Card>
        <Empty
          title="No report cards to print"
          hint="Generate the cards for this class and term first."
        />
      </Card>
    );
  }

  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/app/report-cards?term=${term}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
          >
            <ArrowLeft className="size-3.5" /> Report cards
          </Link>
          <p className="mt-1 text-[13.5px] text-ink-2">
            {cards.length} card{cards.length === 1 ? "" : "s"} · {cards[0].examTerm?.name}
          </p>
        </div>
        <PrintButton label={`Print ${cards.length} report cards`} />
      </div>

      <div className="space-y-6">
        {cards.map((c) => (
          <div key={c.id} className="card overflow-hidden print:border-0 print:shadow-none page-break">
            <ReportCardSheet
              school={school}
              student={c.student}
              snapshot={c.snapshot as CardSnapshot}
              totalMarks={c.totalMarks}
              maxMarks={c.maxMarks}
              percentBp={c.percentage}
              grade={c.grade}
              rankInClass={c.rankInClass}
              attendancePercentBp={c.attendancePercent}
              classTeacherRemark={c.classTeacherRemark}
              principalRemark={c.principalRemark}
              publishedAt={c.publishedAt}
              academicYear={year?.name ?? ""}
          className={c.class?.name ?? null}
          sectionName={c.section?.name ?? null}
            />
          </div>
        ))}
      </div>
    </>
  );
}
