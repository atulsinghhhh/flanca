import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { canDeleteSubject } from "@/lib/core/setup-core";
import { Card, Empty, PageHead, Stat } from "@/components/ui/primitives";
import { SubjectEditor, type SubjectRow, type TeacherOption } from "./subject-editor";

export const metadata = { title: "Subjects — Flanca" };

export default async function SubjectsSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const actor = await requireRole(...OFFICE);
  const sp = await searchParams;

  const classes = await db.class.findMany({
    where: { schoolId: actor.schoolId },
    orderBy: { sequenceOrder: "asc" },
    select: { id: true, name: true, _count: { select: { subjects: true } } },
  });

  // One class at a time: a school has fourteen of them and seventy subjects, and a
  // page that lists all of them is a page nobody edits carefully.
  const selected = classes.find((c) => c.id === sp.class) ?? classes[0] ?? null;

  const [subjects, staff] = await Promise.all([
    selected
      ? db.subject.findMany({
          where: { schoolId: actor.schoolId, classId: selected.id },
          orderBy: [{ isCoScholastic: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            code: true,
            isElective: true,
            isCoScholastic: true,
            staffSubjects: { select: { staffId: true, staff: { select: { user: { select: { name: true } } } } } },
            _count: { select: { exams: true, timetable: true, homework: true, lessonPlans: true } },
          },
        })
      : Promise.resolve([]),
    db.staff.findMany({
      where: { schoolId: actor.schoolId, isActive: true },
      orderBy: { user: { name: "asc" } },
      select: { id: true, employeeId: true, designation: true, user: { select: { name: true } } },
    }),
  ]);

  const rows: SubjectRow[] = subjects.map((s) => {
    const check = canDeleteSubject({
      exams: s._count.exams,
      timetable: s._count.timetable,
      homework: s._count.homework,
      lessonPlans: s._count.lessonPlans,
    });
    return {
      id: s.id,
      name: s.name,
      code: s.code,
      isElective: s.isElective,
      isCoScholastic: s.isCoScholastic,
      teacherStaffIds: s.staffSubjects.map((ss) => ss.staffId),
      teacherNames: s.staffSubjects.map((ss) => ss.staff.user.name),
      removable: check.allowed,
      whyNot: check.reason,
    };
  });

  const teachers: TeacherOption[] = staff.map((s) => ({
    staffId: s.id,
    name: s.user.name,
    // Two members of staff here really do share a name — one a librarian, one a
    // teacher — so the picker says which is which.
    label: `${s.user.name} · ${s.designation ?? s.employeeId}`,
  }));
  const total = classes.reduce((n, c) => n + c._count.subjects, 0);
  const unstaffed = rows.filter((r) => r.teacherStaffIds.length === 0).length;

  return (
    <>
      <Link
        href="/app/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Settings
      </Link>

      <PageHead
        eyebrow="Setup"
        title="Subjects"
        sub="What each class is taught, and who teaches it. Exam papers, the timetable and every report card are built from this list — and a teacher's own 'marks still to enter' comes from who is assigned here."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Subjects in the school" value={total} sub={`across ${classes.length} classes`} />
        <Stat label={`In ${selected?.name ?? "—"}`} value={rows.length} sub="shown below" />
        <Stat
          label="Nobody assigned"
          value={unstaffed}
          sub={unstaffed === 0 ? "every subject has a teacher" : "in this class"}
          tone={unstaffed === 0 ? "good" : "warn"}
        />
        <Stat label="Teachers available" value={teachers.length} sub="active staff" />
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {classes.map((c) => (
          <Link
            key={c.id}
            href={`/app/settings/subjects?class=${c.id}`}
            className={`rounded-md border px-2.5 py-1.5 text-[13px] font-medium ${
              selected?.id === c.id
                ? "border-brand bg-brand-light text-brand-ink"
                : "border-line bg-white text-ink-2 hover:border-line-2"
            }`}
          >
            {c.name}
            <span className="ml-1.5 text-[11.5px] text-ink-3">{c._count.subjects}</span>
          </Link>
        ))}
      </div>

      {selected ? (
        <SubjectEditor classId={selected.id} className={selected.name} subjects={rows} teachers={teachers} />
      ) : (
        <Card className="mt-5">
          <Empty
            title="No classes yet."
            hint="Add a class first — subjects belong to a class."
            action={
              <Link href="/app/settings/classes" className="text-[13.5px] font-semibold text-brand">
                Classes & sections
              </Link>
            }
          />
        </Card>
      )}
    </>
  );
}
