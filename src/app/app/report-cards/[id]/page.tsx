import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { hasRole, requireActor } from "@/lib/session";
import { ReportCardSheet, type CardSnapshot } from "@/components/print/report-card-sheet";
import { PrintButton } from "@/app/app/fees/receipt/print-button";
import { RemarkBox } from "./remark-box";

export const metadata = { title: "Report card — Flanca" };

export default async function ReportCardPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  const [card, school, year] = await Promise.all([
    db.reportCard.findFirst({
      where: { id, schoolId: actor.schoolId },
      include: {
        student: {
          select: {
            id: true, name: true, admissionNumber: true, rollNumber: true,
            fatherName: true, motherName: true, dob: true, apaarId: true,
          },
        },
        examTerm: { select: { name: true } },
        class: { select: { name: true } },
        section: { select: { name: true } },
      },
    }),
    db.school.findUnique({
      where: { id: actor.schoolId },
      select: { name: true, address: true, phone: true, email: true, affiliationNo: true, udiseCode: true },
    }),
    db.academicYear.findFirst({ where: { schoolId: actor.schoolId, isCurrent: true } }),
  ]);

  if (!card || !school) notFound();

  // Office sees any card. A class teacher may preview their own class's card
  // before it is published (to add a remark). A parent/student may only see
  // their own child's/own card, and only once it is actually published — the
  // same rule the dashboards and the mobile report-cards/me route already
  // enforce.
  const isOffice = hasRole(actor, "OWNER", "PRINCIPAL", "ADMIN");
  let allowed = isOffice;
  if (!allowed && hasRole(actor, "TEACHER")) {
    allowed = !!(await db.section.findFirst({
      where: {
        schoolId: actor.schoolId,
        classTeacherId: actor.id,
        ...(card.sectionId ? { id: card.sectionId } : card.classId ? { classId: card.classId } : { id: "" }),
      },
      select: { id: true },
    }));
  }
  if (!allowed && hasRole(actor, "PARENT")) {
    allowed =
      card.publishedAt != null &&
      !!(await db.parentLink.findFirst({
        where: { schoolId: actor.schoolId, userId: actor.id, studentId: card.studentId },
        select: { id: true },
      }));
  }
  if (!allowed && hasRole(actor, "STUDENT")) {
    const student = await db.student.findUnique({ where: { id: card.studentId }, select: { userId: true } });
    allowed = card.publishedAt != null && student?.userId === actor.id;
  }
  if (!allowed) notFound();

  const isPrincipal = hasRole(actor, "PRINCIPAL");

  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/app/students/${card.student.id}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" /> {card.student.name}
        </Link>
        <PrintButton label="Print report card" />
      </div>

      <div className="no-print mb-5">
        <RemarkBox
          reportCardId={card.id}
          initial={card.classTeacherRemark ?? ""}
          principalInitial={card.principalRemark ?? ""}
          showPrincipalRemark={isPrincipal}
        />
      </div>

      <div className="card overflow-hidden print:border-0 print:shadow-none">
        <ReportCardSheet
          school={school}
          student={card.student}
          snapshot={card.snapshot as CardSnapshot}
          totalMarks={card.totalMarks}
          maxMarks={card.maxMarks}
          percentBp={card.percentage}
          grade={card.grade}
          rankInClass={card.rankInClass}
          attendancePercentBp={card.attendancePercent}
          classTeacherRemark={card.classTeacherRemark}
          principalRemark={card.principalRemark}
          publishedAt={card.publishedAt}
          academicYear={year?.name ?? ""}
          className={card.class?.name ?? null}
          sectionName={card.section?.name ?? null}
        />
      </div>
    </>
  );
}
