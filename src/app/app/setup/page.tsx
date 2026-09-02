import Link from "next/link";
import { ArrowRight, Check, CircleDashed, Lock } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { formatPercent } from "@/lib/core/grading-core";
import { setupProgress, setupSteps } from "@/lib/core/onboarding-core";
import { Badge, Card, CardHead, Meter, PageHead } from "@/components/ui/primitives";

export const metadata = { title: "Setting up — Flanca" };

/**
 * What a school still has to do.
 *
 * Built last on purpose. A checklist is only worth anything if every step it points
 * at can actually be done, and until this week a school could not create an academic
 * year, a term, a member of staff, an exam, a timetable period, a concession or a bus
 * route — so this would have been a list of dead ends.
 *
 * Every number here is counted from the school's own data. Nothing is remembered, so
 * a step cannot be ticked while the thing it describes is missing.
 */
export default async function SetupPage() {
  const actor = await requireRole(...OFFICE);

  const year = await db.academicYear.findFirst({
    where: { schoolId: actor.schoolId, isCurrent: true },
    select: { id: true, name: true },
  });

  const [
    school, classes, sections, sectionsWithCT, subjects, subjectsWithTeacher, teachers,
    students, feeHeads, structures, terms, invoices, timetabled, examCycles,
  ] = await Promise.all([
    db.school.findUnique({
      where: { id: actor.schoolId },
      select: { name: true, board: true, address: true, phone: true },
    }),
    db.class.count({ where: { schoolId: actor.schoolId } }),
    db.section.count({ where: { schoolId: actor.schoolId } }),
    db.section.count({ where: { schoolId: actor.schoolId, classTeacherId: { not: null } } }),
    db.subject.count({ where: { schoolId: actor.schoolId } }),
    db.subject.count({ where: { schoolId: actor.schoolId, staffSubjects: { some: {} } } }),
    db.staff.count({ where: { schoolId: actor.schoolId, isActive: true } }),
    db.student.count({ where: { schoolId: actor.schoolId, status: "ACTIVE" } }),
    db.feeHead.count({ where: { schoolId: actor.schoolId } }),
    year
      ? db.feeStructure.findMany({
          where: { schoolId: actor.schoolId, academicYearId: year.id, isActive: true, items: { some: {} } },
          select: { classId: true },
        })
      : Promise.resolve([]),
    year
      ? db.installmentPlan.findMany({
          where: { schoolId: actor.schoolId, feeStructure: { academicYearId: year.id } },
          select: { label: true },
        })
      : Promise.resolve([]),
    db.feeInvoice.count({ where: { schoolId: actor.schoolId, cancelledAt: null } }),
    db.timetableEntry.findMany({
      where: { schoolId: actor.schoolId },
      select: { sectionId: true },
      distinct: ["sectionId"],
    }),
    year
      ? db.examTerm.findMany({
          where: { schoolId: actor.schoolId, academicYearId: year.id },
          select: { name: true },
        })
      : Promise.resolve([]),
  ]);

  const steps = setupSteps({
    // "Filled in" means the four things that print on a receipt, not merely a row
    // existing — every school has a row from the moment it is created.
    hasSchoolDetails: Boolean(school?.name && school.board && school.address && school.phone),
    hasCurrentYear: Boolean(year),
    classes,
    sections,
    subjects,
    subjectsWithTeacher,
    teachers,
    sectionsWithClassTeacher: sectionsWithCT,
    students,
    feeHeads,
    classesPriced: new Set(structures.map((s) => s.classId)).size,
    terms: new Set(terms.map((t) => t.label)).size,
    invoicesRaised: invoices,
    timetabledSections: timetabled.filter((t) => t.sectionId).length,
    examCycles: new Set(examCycles.map((e) => e.name)).size,
  });

  const progress = setupProgress(steps);
  const finished = progress.done >= progress.total;

  return (
    <>
      <PageHead
        eyebrow="Setup"
        title={finished ? "The school is set up" : "Setting up the school"}
        sub={
          finished
            ? "Everything a school needs to run is in place. This screen stays, so you can see at a glance if something goes missing."
            : "In order, because each of these needs the one above it. Everything is counted from your own data — nothing here is ticked off from memory."
        }
      />

      <Card>
        <CardHead
          title={`${progress.done} of ${progress.total} done`}
          hint={
            progress.nextUp
              ? `Next: ${progress.nextUp.title.toLowerCase()}.`
              : finished
                ? "Nothing left that a school cannot open without."
                : "Everything left is waiting on something else."
          }
          action={<Badge tone={finished ? "good" : "brand"}>{formatPercent(progress.percentBp, 0)}</Badge>}
        />
        <div className="px-5 pb-4">
          <Meter valueBp={progress.percentBp} tone={finished ? "good" : "warn"} />
        </div>

        <ul className="divide-y divide-line">
          {steps.map((step) => (
            <li key={step.key} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5">
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border ${
                  step.done
                    ? "border-good/30 bg-good-light text-good"
                    : step.blockedBy
                      ? "border-line bg-paper-2 text-ink-3"
                      : "border-brand/30 bg-brand-light text-brand"
                }`}
              >
                {step.done ? (
                  <Check className="size-3.5" />
                ) : step.blockedBy ? (
                  <Lock className="size-3" />
                ) : (
                  <CircleDashed className="size-3.5" />
                )}
              </span>

              <div className="min-w-[220px] flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold">
                  {step.title}
                  {step.optional ? <Badge tone="neutral">can wait</Badge> : null}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{step.why}</p>
                {step.blockedBy ? (
                  <p className="mt-1 text-[12px] font-medium text-marigold">
                    Waiting for {step.blockedBy}.
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-4">
                <span className={`text-[12.5px] ${step.done ? "text-good" : "text-ink-3"}`}>{step.detail}</span>
                {step.blockedBy && !step.done ? null : (
                  <Link
                    href={step.href}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
                  >
                    {step.done ? "Review" : "Do it"} <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <p className="mt-4 px-1 text-[12.5px] leading-relaxed text-ink-3">
        Nothing on this list is a one-way door. A class can be renamed, a fee can be changed, a term can be
        moved — and where a change would rewrite history rather than the future, the screen says so and
        refuses. Invoices already raised keep what they were raised with.
      </p>
    </>
  );
}
