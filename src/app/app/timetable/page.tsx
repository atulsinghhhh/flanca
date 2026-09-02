import Link from "next/link";
import { CalendarRange, Printer, TriangleAlert } from "lucide-react";
import { db } from "@/lib/db";
import { requireActor, hasRole, OFFICE } from "@/lib/session";
import { getClassOptions } from "@/lib/queries/students";
import { schoolToday } from "@/lib/queries/when";
import { cn } from "@/lib/utils";
import { Badge, Card, CardHead, Empty, PageHead } from "@/components/ui/primitives";
import { teacherLoad } from "@/lib/core/timetable-core";
import { PrintButton } from "@/app/app/fees/receipt/print-button";
import { TimetableEditor } from "./timetable-editor";
import type { Cell, SubjectOption, TeacherOption } from "./timetable-editor";

export const metadata = { title: "Timetable — Flanca" };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ sectionId?: string; staffId?: string }>;
}) {
  const actor = await requireActor();
  const sp = await searchParams;
  const isOffice = hasRole(actor, ...OFFICE);
  const hasExplicitChoice = Boolean(sp.sectionId || sp.staffId);

  // What a teacher lands on by default, with no section or colleague chosen:
  // a class teacher's own class in full — every subject, whoever teaches it,
  // because that whole day is theirs to know. A subject-only teacher has no
  // "own class" to show the whole of, so theirs is a personal week instead.
  // Office keeps browsing by section, the same as ever.
  const [myClassTeacherSection, myStaff] = !isOffice
    ? await Promise.all([
        db.section.findFirst({ where: { schoolId: actor.schoolId, classTeacherId: actor.id }, select: { id: true } }),
        db.staff.findFirst({ where: { schoolId: actor.schoolId, userId: actor.id }, select: { id: true } }),
      ])
    : [null, null];

  const defaultingToOwnClass = !isOffice && !hasExplicitChoice && Boolean(myClassTeacherSection);
  const defaultingToOwnWeek = !isOffice && !hasExplicitChoice && !myClassTeacherSection;

  const effectiveStaffId = sp.staffId || (defaultingToOwnWeek ? myStaff?.id : undefined);

  const classes = await getClassOptions(actor.schoolId);
  const viewingTeacher = Boolean(effectiveStaffId);
  const sectionId = viewingTeacher
    ? undefined
    : sp.sectionId || (defaultingToOwnClass ? myClassTeacherSection?.id : undefined) || classes[0]?.sections[0]?.id;

  const [entries, section, staffList, staff] = await Promise.all([
    db.timetableEntry.findMany({
      where: {
        schoolId: actor.schoolId,
        ...(viewingTeacher ? { staffId: effectiveStaffId } : { sectionId }),
      },
      orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
      include: {
        subject: { select: { name: true } },
        staff: { include: { user: { select: { name: true } } } },
        class: { select: { name: true } },
        section: { select: { name: true } },
      },
    }),
    sectionId
      ? db.section.findFirst({
          where: { id: sectionId, schoolId: actor.schoolId },
          include: { class: { select: { name: true } }, classTeacher: { select: { name: true } } },
        })
      : null,
    db.staff.findMany({
      where: { schoolId: actor.schoolId, isActive: true, department: "Academics" },
      orderBy: { employeeId: "asc" },
      include: { user: { select: { name: true } } },
    }),
    effectiveStaffId
      ? db.staff.findFirst({
          where: { id: effectiveStaffId, schoolId: actor.schoolId },
          include: { user: { select: { name: true } } },
        })
      : null,
  ]);

  // Editing is the office's job, and only makes sense looking at a section: a
  // teacher's week is a view of everybody else's sections.
  const canEdit = isOffice && !viewingTeacher && Boolean(sectionId) && Boolean(section);

  // Monday = 1 … Sunday = 7, the same mapping the rest of the app uses for
  // "today" — computed in the school's own timezone, not the server's.
  const todayDow = ((schoolToday().getUTCDay() + 6) % 7) + 1;

  const [editSubjects, allPeriods] = canEdit
    ? await Promise.all([
        db.subject.findMany({
          where: { schoolId: actor.schoolId, classId: section!.classId, isCoScholastic: false },
          orderBy: { name: "asc" },
          select: { id: true, name: true, staffSubjects: { select: { staffId: true } } },
        }),
        db.timetableEntry.findMany({
          where: { schoolId: actor.schoolId },
          select: {
            staffId: true, dayOfWeek: true, period: true, sectionId: true,
            section: { select: { name: true } }, class: { select: { name: true } },
          },
        }),
      ])
    : [[], []];

  const load = teacherLoad(allPeriods);
  const busyElsewhere: Record<string, { staffId: string; where: string }[]> = {};
  for (const e of allPeriods) {
    if (!e.staffId || e.sectionId === sectionId) continue;
    const k = `${e.dayOfWeek}|${e.period}`;
    (busyElsewhere[k] ??= []).push({
      staffId: e.staffId,
      where: `${e.class?.name ?? ""} ${e.section?.name ?? ""}`.trim() || "another section",
    });
  }

  const maxPeriod = Math.max(8, ...entries.map((e) => e.period));
  const periods = Array.from({ length: maxPeriod }, (_, i) => i + 1);
  const cell = (day: number, period: number) =>
    entries.find((e) => e.dayOfWeek === day && e.period === period);

  // A teacher standing in two rooms at once is the classic timetable bug, so
  // the clash is surfaced rather than left for a Monday morning to discover.
  const clashes = viewingTeacher
    ? entries.filter(
        (e, i) => entries.findIndex((x) => x.dayOfWeek === e.dayOfWeek && x.period === e.period) !== i,
      )
    : [];

  const title = viewingTeacher
    ? (staff?.user.name ?? "Teacher")
    : section
      ? `${section.class.name} ${section.name}`
      : "Timetable";

  return (
    <>
      <div className="no-print">
        <PageHead
          eyebrow="Academics"
          title="Timetable"
          sub={
            isOffice
              ? "By section, or by teacher to see one person's whole week."
              : defaultingToOwnClass
                ? "Your class's whole week — every subject, whoever teaches it."
                : "Your own week. Pick a section or a colleague to see theirs."
          }
          actions={
            <>
              <form method="get" className="flex flex-wrap items-center gap-2">
                <select
                  name="sectionId"
                  defaultValue={viewingTeacher ? "" : (sectionId ?? "")}
                  className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
                >
                  <option value="">By section…</option>
                  {classes.flatMap((c) =>
                    c.sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {c.name} {s.name}
                      </option>
                    )),
                  )}
                </select>
                <select
                  name="staffId"
                  defaultValue={effectiveStaffId ?? ""}
                  className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
                >
                  <option value="">By teacher…</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.user.name}
                      {!isOffice && myStaff?.id === s.id ? " (you)" : ""}
                    </option>
                  ))}
                </select>
                <button className="h-9 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold hover:bg-paper-2">
                  Show
                </button>
              </form>
              <PrintButton label="Print timetable" />
            </>
          }
        />

        {clashes.length > 0 ? (
          <div className="mb-5 flex items-center gap-3 rounded-lg border border-overdue/30 bg-overdue-light px-4 py-3">
            <TriangleAlert className="size-5 shrink-0 text-overdue" />
            <p className="text-[13.5px] text-overdue-ink">
              <strong className="font-semibold">
                {clashes.length} clash{clashes.length === 1 ? "" : "es"}
              </strong>{" "}
              — this teacher is timetabled in two places at once. Fix it before Monday.
            </p>
          </div>
        ) : null}
      </div>

      <Card className="overflow-hidden print:border-0 print:shadow-none">
        <div className="hidden px-5 py-3 text-center print:block">
          <h2 className="font-display text-[16px] font-bold">{title} — Timetable</h2>
        </div>

        <div className="no-print">
          <CardHead
            title={title}
            hint={
              viewingTeacher
                ? `${entries.length} periods a week`
                : section?.classTeacher
                  ? `Class teacher ${section.classTeacher.name}`
                  : undefined
            }
          />
        </div>

        {canEdit ? (
          <TimetableEditor
            sectionId={sectionId!}
            sectionLabel={title}
            periods={periods}
            cells={entries.map<Cell>((e) => ({
              dayOfWeek: e.dayOfWeek,
              period: e.period,
              subjectId: e.subjectId,
              subjectName: e.subject?.name ?? null,
              staffId: e.staffId,
              staffName: e.staff?.user.name ?? null,
              roomNo: e.roomNo,
              meetingUrl: e.meetingUrl,
            }))}
            subjects={editSubjects.map<SubjectOption>((s) => ({
              id: s.id,
              name: s.name,
              teacherStaffIds: s.staffSubjects.map((x) => x.staffId),
            }))}
            teachers={staffList.map<TeacherOption>((s) => ({
              staffId: s.id,
              name: s.user.name,
              periods: load.get(s.id) ?? 0,
            }))}
            busyElsewhere={busyElsewhere}
          />
        ) : entries.length === 0 ? (
          <Empty
            title="No timetable set"
            hint="Once periods are assigned they appear here and on every teacher's home screen."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 w-20 border border-line bg-paper-2 px-2 py-2 text-left">Day</th>
                  {periods.map((p) => (
                    <th key={p} className="border border-line bg-paper-2 px-2 py-2 text-center font-semibold">
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day, i) => {
                  const isToday = i + 1 === todayDow;
                  return (
                    <tr key={day} className={isToday ? "bg-brand-light/25" : undefined}>
                      <td
                        className={cn(
                          "sticky left-0 z-10 border border-line px-2 py-2 font-semibold whitespace-nowrap",
                          isToday ? "bg-brand-light text-brand-ink" : "bg-paper-2",
                        )}
                      >
                        {day.slice(0, 3)}
                        {isToday ? <span className="ml-1.5 text-[10px] font-bold tracking-wide uppercase">today</span> : null}
                      </td>
                      {periods.map((p) => {
                        const e = cell(i + 1, p);
                        return (
                          <td
                            key={p}
                            className={cn("border border-line px-2 py-1.5 align-top", isToday && "bg-brand-light/20")}
                          >
                            {e ? (
                              <>
                                <p className="text-[12px] font-medium">{e.subject?.name ?? "—"}</p>
                                <p className="mt-0.5 text-[10.5px] leading-tight text-ink-3">
                                  {viewingTeacher
                                    ? `${e.class?.name ?? ""}${e.section ? ` ${e.section.name}` : ""}`
                                    : (e.staff?.user.name ?? "—")}
                                </p>
                              </>
                            ) : (
                              <span className="text-ink-3">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
