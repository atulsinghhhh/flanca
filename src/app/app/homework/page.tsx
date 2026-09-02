import Link from "next/link";
import { BookOpen, CalendarClock } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, TEACHING } from "@/lib/session";
import { getClassOptions } from "@/lib/queries/students";
import { getChatPerson } from "@/lib/queries/chat";
import { schoolToday } from "@/lib/queries/when";
import { canDeleteHomework } from "@/lib/core/homework-core";
import { Badge, Card, CardHead, Empty, PageHead, Stat } from "@/components/ui/primitives";
import { HomeworkForm } from "./homework-form";
import type { RecentHomework, SectionOption } from "./homework-form";

export const metadata = { title: "Homework — Flanca" };

const DATE = (d: Date | null) =>
  d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : "—";

export default async function HomeworkPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const actor = await requireRole(...TEACHING);
  const sp = await searchParams;

  // schoolToday(), not a UTC midnight: between midnight and 05:30 IST the UTC date
  // is still yesterday, which is what made "due from today" wrong for five and a half
  // hours every night — the same bug attendance had.
  const today = schoolToday();

  // Which sections this person may set homework for. The same reach chat uses —
  // the office is not exempt: they can only create for a section they themselves
  // are class teacher of or have a period with, same as a teacher.
  const person = await getChatPerson(actor.schoolId, actor.id);
  const isOffice = Boolean(person?.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r)));

  // A DRAFT was never shown to a student or a parent, and not to another
  // teacher either — only the office and the teacher who wrote it.
  const draftFilter = isOffice
    ? {}
    : person?.staffId
      ? { OR: [{ status: { not: "DRAFT" as const } }, { status: "DRAFT" as const, staffId: person.staffId }] }
      : { status: { not: "DRAFT" as const } };

  const [homework, classes, lessonPlans] = await Promise.all([
    db.homework.findMany({
      where: {
        schoolId: actor.schoolId,
        ...(sp.classId ? { classId: sp.classId } : {}),
        ...draftFilter,
      },
      orderBy: [{ dueOn: "asc" }, { assignedOn: "desc" }],
      take: 60,
      include: {
        class: { select: { name: true } },
        section: { select: { name: true } },
        subject: { select: { name: true } },
        staff: { include: { user: { select: { name: true } } } },
        _count: { select: { submissions: true } },
      },
    }),
    getClassOptions(actor.schoolId),
    db.lessonPlan.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { weekOf: "desc" },
      take: 8,
      include: {
        class: { select: { name: true } },
        subject: { select: { name: true } },
        staff: { include: { user: { select: { name: true } } } },
      },
    }),
  ]);
  const reachable = person
    ? [...new Set([...person.classTeacherOfSectionIds, ...person.teachesSectionIds])]
    : [];

  const mySections = person
    ? await db.section.findMany({
        where: {
          schoolId: actor.schoolId,
          id: { in: reachable },
        },
        orderBy: [{ class: { sequenceOrder: "asc" } }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          classId: true,
          class: { select: { name: true, subjects: { where: { isCoScholastic: false }, select: { id: true, name: true }, orderBy: { name: "asc" } } } },
        },
      })
    : [];

  const sectionOptions: SectionOption[] = mySections.map((s) => ({
    sectionId: s.id,
    label: `${s.class?.name ?? ""} ${s.name}`.trim(),
    subjects: s.class?.subjects ?? [],
  }));

  const mine: RecentHomework[] = homework
    .filter((h) => (isOffice ? true : person?.staffId && h.staffId === person.staffId))
    .slice(0, 8)
    .map((h) => {
      const guard = canDeleteHomework({ submissions: h._count.submissions });
      return {
        id: h.id,
        title: h.title,
        label: `${h.class?.name ?? ""} ${h.section?.name ?? ""}`.trim(),
        dueOn: h.dueOn ? DATE(h.dueOn) : null,
        submissions: h._count.submissions,
        status: h.status,
        removable: guard.allowed,
        whyNot: guard.reason,
      };
    });

  const dueSoon = homework.filter((h) => h.dueOn && h.dueOn >= today);
  const overdue = homework.filter((h) => h.dueOn && h.dueOn < today);

  return (
    <>
      <PageHead
        eyebrow="Academics"
        title="Homework & lesson plans"
        sub="What has been set, by whom, and when it is due. Students and parents see what's due for their own child on their own home screen."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Set this term" value={homework.length} icon={<BookOpen className="size-4" />} />
        <Stat label="Due from today" value={dueSoon.length} tone="warn" sub="still to be handed in" />
        <Stat label="Past the due date" value={overdue.length} sub="already collected or overdue" />
      </div>

      <HomeworkForm sections={sectionOptions} todayIso={today.toISOString().slice(0, 10)} mine={mine} />

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <CardHead title="Homework" hint="Soonest due first" />

          <form method="get" className="border-b border-line px-5 py-3">
            <select
              name="classId"
              defaultValue={sp.classId ?? ""}
              className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button className="ml-2 h-9 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold hover:bg-paper-2">
              Show
            </button>
          </form>

          {homework.length === 0 ? (
            <Empty title="Nothing set" hint="Homework assigned by a teacher appears here." />
          ) : (
            <ul className="divide-y divide-line">
              {homework.map((h) => {
                const late = h.dueOn && h.dueOn < today;
                return (
                  <li key={h.id} className="px-5 py-3">
                    <Link href={`/app/homework/${h.id}`} className="flex flex-wrap items-start justify-between gap-3 hover:opacity-90">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[14px] font-medium">
                          {h.title}
                          {h.status === "DRAFT" ? <Badge tone="neutral">Draft</Badge> : null}
                          {h.status === "CLOSED" ? <Badge tone="bad">Closed</Badge> : null}
                        </p>
                        <p className="mt-0.5 text-[12px] text-ink-3">
                          {h.class?.name}
                          {h.section ? ` ${h.section.name}` : ""} · {h.subject?.name ?? "—"} ·{" "}
                          {h.staff?.user.name ?? "—"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge tone={late ? "neutral" : "warn"}>
                          <CalendarClock className="size-3" /> due {DATE(h.dueOn)}
                        </Badge>
                        {h._count.submissions > 0 ? (
                          <p className="mt-1 text-[11px] text-ink-3">
                            {h._count.submissions} handed in
                          </p>
                        ) : null}
                      </div>
                    </Link>
                    {h.details ? (
                      <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">{h.details}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHead title="Lesson plans" hint="What teachers intend to cover this week" />
          {lessonPlans.length === 0 ? (
            <Empty title="No lesson plans" />
          ) : (
            <ul className="divide-y divide-line">
              {lessonPlans.map((l) => (
                <li key={l.id} className="px-5 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-[13.5px] font-medium">{l.topic}</p>
                    <Badge tone={l.completed ? "good" : "neutral"}>
                      {l.completed ? "Done" : "Planned"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">
                    {l.class?.name ?? "—"} · {l.subject?.name ?? "—"} · {l.staff?.user.name ?? "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
