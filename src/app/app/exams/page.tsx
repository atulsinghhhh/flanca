import Link from "next/link";
import { CalendarDays, FileCheck2, GraduationCap } from "lucide-react";
import { db } from "@/lib/db";
import { requireActor, hasRole, OFFICE } from "@/lib/session";
import { getExamScope, getExamTerms } from "@/lib/queries/exams";
import { formatPercent } from "@/lib/core/grading-core";
import { canDeleteExamCycle } from "@/lib/core/exam-core";
import { Badge, ButtonLink, Card, CardHead, Empty, Meter, PageHead, Stat } from "@/components/ui/primitives";
import { ExamSetup } from "./exam-setup";
import type { ClassOption, CycleOption } from "./exam-setup";

export const metadata = { title: "Exams & marks — Flanca" };

export default async function ExamsPage() {
  const actor = await requireActor();

  // Only the office sets exams up; a teacher opening this page is here to see what
  // is left to mark — and only for their own class (as class teacher) or their own
  // subject (as the subject's timetable teacher), never the whole school's.
  const office = hasRole(actor, ...OFFICE);
  const scope = await getExamScope(actor, office);
  const terms = await getExamTerms(actor.schoolId, scope);
  const year = office
    ? await db.academicYear.findFirst({
        where: { schoolId: actor.schoolId, isCurrent: true },
        select: { id: true },
      })
    : null;

  const [rawTerms, classes] = year
    ? await Promise.all([
        db.examTerm.findMany({
          where: { schoolId: actor.schoolId, academicYearId: year.id },
          select: {
            id: true, name: true, startDate: true, endDate: true, weightage: true,
            classId: true,
            class: { select: { id: true, name: true, sequenceOrder: true, _count: { select: { subjects: true } } } },
            _count: { select: { reportCards: true } },
            exams: { select: { _count: { select: { results: true } } } },
          },
        }),
        db.class.findMany({
          where: { schoolId: actor.schoolId },
          orderBy: { sequenceOrder: "asc" },
          select: { id: true, name: true },
        }),
      ])
    : [[], []];

  // One entry per cycle, gathering each class's copy — the same grouping getExamTerms
  // does, but carrying what setting one up needs: how many papers exist against how
  // many subjects, and whether anything has been marked.
  const cycleMap = new Map<string, CycleOption & { results: number; reportCards: number }>();
  for (const t of rawTerms) {
    const at = cycleMap.get(t.name) ?? {
      name: t.name,
      startIso: t.startDate?.toISOString().slice(0, 10) ?? null,
      endIso: t.endDate?.toISOString().slice(0, 10) ?? null,
      weightage: t.weightage,
      classes: [],
      removable: true,
      whyNot: null,
      results: 0,
      reportCards: 0,
    };
    if (t.class) {
      at.classes.push({
        classId: t.class.id,
        className: t.class.name,
        papers: t.exams.length,
        // Co-scholastic subjects are graded, not examined, so they are not papers —
        // but _count.subjects counts them. The action filters them; this number is
        // only the upper bound shown in the picker.
        subjects: t.class._count.subjects,
      });
    }
    at.results += t.exams.reduce((a, e) => a + e._count.results, 0);
    at.reportCards += t._count.reportCards;
    cycleMap.set(t.name, at);
  }

  const cycles: CycleOption[] = [...cycleMap.values()].map((c) => {
    const guard = canDeleteExamCycle({ results: c.results, reportCards: c.reportCards });
    return { ...c, removable: guard.allowed, whyNot: guard.reason };
  });

  const totalExpected = terms.reduce((a, t) => a + t.expected, 0);
  const totalEntered = terms.reduce((a, t) => a + t.entered, 0);

  return (
    <>
      <PageHead
        eyebrow="Academics"
        title="Exams & marks"
        sub="Every exam cycle in the year, and exactly how much marks entry is left. A term can only be published once no subject is blank."
        actions={
          <ButtonLink href="/app/report-cards" variant="secondary" size="sm">
            <FileCheck2 className="size-4" /> Report cards
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Exam cycles" value={terms.length} sub="this academic year" icon={<GraduationCap className="size-4" />} />
        <Stat
          label="Marks entered"
          value={totalExpected > 0 ? formatPercent(Math.round((totalEntered / totalExpected) * 10000), 0) : "—"}
          tone={totalEntered >= totalExpected && totalExpected > 0 ? "good" : "warn"}
          sub={`${totalEntered.toLocaleString("en-IN")} of ${totalExpected.toLocaleString("en-IN")} expected entries`}
        />
        <Stat
          label="Published"
          value={terms.filter((t) => t.isPublished).length}
          sub={`${terms.filter((t) => !t.isPublished).length} still in draft`}
        />
      </div>

      {office ? <ExamSetup cycles={cycles} classes={classes as ClassOption[]} /> : null}

      <Card className="mt-5">
        <CardHead title="Exam cycles" hint="Grouped across classes — one row per cycle, not one per class." />
        {terms.length === 0 ? (
          <Empty
            title={office ? "No exams yet" : "Nothing assigned to you yet"}
            hint={
              office
                ? "Create an exam term to start entering marks."
                : "You'll see exams here once you're set as a class teacher or a subject's timetable teacher. Ask the office if this looks wrong."
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {terms.map((t) => {
              const progressBp = t.expected > 0 ? Math.round((t.entered / t.expected) * 10000) : 0;
              return (
                <li key={t.name}>
                  <Link
                    href={`/app/exams/term/${encodeURIComponent(t.name)}`}
                    className="flex flex-wrap items-center gap-4 px-5 py-3.5 transition-colors hover:bg-brand-light/35"
                  >
                    <div className="min-w-[180px] flex-1">
                      <p className="flex items-center gap-2 text-[15px] font-semibold">
                        {t.name}
                        <Badge tone={t.isPublished ? "good" : "warn"}>
                          {t.isPublished ? "Published" : "Draft"}
                        </Badge>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                        <CalendarDays className="size-3.5" />
                        {t.startDate
                          ? t.startDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                          : "no date"}
                        {t.endDate
                          ? ` – ${t.endDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                          : ""}
                        {` · ${t.classCount} classes · ${t.examCount} papers`}
                      </p>
                    </div>

                    <div className="w-56">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[12px] text-ink-3">Marks entered</span>
                        <span className="tnum text-[12.5px] font-semibold">
                          {formatPercent(progressBp, 0)}
                        </span>
                      </div>
                      <Meter
                        valueBp={progressBp}
                        tone={progressBp >= 10000 ? "good" : progressBp > 0 ? "warn" : "neutral"}
                        className="mt-1"
                      />
                      <p className="mt-1 text-[11.5px] text-ink-3">
                        {t.entered.toLocaleString("en-IN")} / {t.expected.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
