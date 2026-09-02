import Link from "next/link";
import {
  CalendarDays, CheckCircle2, ClipboardCheck, Printer, TriangleAlert, UserCog, Users,
} from "lucide-react";
import { requireRole, hasRole, OFFICE, TEACHING } from "@/lib/session";
import { resolveDay, isoDay } from "@/lib/queries/when";
import { getMarkingStatus } from "@/lib/queries/attendance";
import { db } from "@/lib/db";
import { formatPercent } from "@/lib/core/grading-core";
import { Badge, ButtonLink, Card, CardHead, Empty, Meter, PageHead, Stat } from "@/components/ui/primitives";

export const metadata = { title: "Attendance — Flanca" };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const actor = await requireRole(...TEACHING);
  const { date } = await searchParams;

  const when = resolveDay(date);
  const isOffice = hasRole(actor, ...OFFICE);

  // A teacher sees only the sections they are class teacher of — attendance is
  // that section's own daily register, not a school-wide screen. Office sees
  // every section, the same as ever.
  const onlySectionIds = isOffice
    ? undefined
    : (
        await db.section.findMany({
          where: { schoolId: actor.schoolId, classTeacherId: actor.id },
          select: { id: true },
        })
      ).map((s) => s.id);

  const status = await getMarkingStatus(actor.schoolId, when, onlySectionIds);
  const iso = isoDay(status.date);

  const absentees = status.totals.absent > 0
    ? await db.attendance.findMany({
        where: { schoolId: actor.schoolId, date: status.date, status: "ABSENT", studentId: { not: null } },
        take: 14,
        include: {
          student: {
            select: {
              id: true, name: true, guardianPhone: true,
              class: { select: { name: true } }, section: { select: { name: true } },
            },
          },
        },
      })
    : [];

  return (
    <>
      <PageHead
        eyebrow="Today"
        title="Attendance"
        sub={
          isOffice
            ? "One tap per absent student. Works with no signal — marks are held on the device and sync themselves."
            : "Your own section's register. Works with no signal — marks are held on the device and sync themselves."
        }
        actions={
          <>
            <form method="get" className="flex items-center gap-2">
              <input
                type="date"
                name="date"
                defaultValue={iso}
                max={isoDay()}
                className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
              />
              <button className="h-9 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold hover:bg-paper-2">
                Go
              </button>
            </form>
            {isOffice ? (
              <>
                <ButtonLink href="/app/attendance/shortage" variant="secondary" size="sm">
                  <TriangleAlert className="size-4" /> Shortage
                </ButtonLink>
                <ButtonLink href="/app/attendance/staff" variant="secondary" size="sm">
                  <UserCog className="size-4" /> Staff
                </ButtonLink>
              </>
            ) : null}
          </>
        }
      />

      {status.holiday ? (
        <div className="mb-5 rounded-lg border border-info/25 bg-info-light px-4 py-2.5 text-[13.5px] text-info">
          <strong>{status.holiday}</strong> — a holiday on the school calendar. Attendance is normally
          not marked today.
        </div>
      ) : status.isNonTeachingDay ? (
        <div className="mb-5 rounded-lg border border-line bg-white px-4 py-2.5 text-[13.5px] text-ink-2">
          This is a non-teaching day (Sunday or second Saturday).
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Sections marked"
          value={`${status.totals.sectionsComplete} / ${status.totals.sectionCount}`}
          tone={status.totals.sectionsComplete === status.totals.sectionCount ? "good" : "warn"}
          sub={
            status.pending.length === 0
              ? "Every section is in"
              : `${status.pending.length} still to mark`
          }
          icon={<ClipboardCheck className="size-4" />}
        />
        <Stat
          label="Present today"
          value={status.totals.marked > 0 ? formatPercent(status.totals.percentBp, 1) : "—"}
          tone={status.totals.marked === 0 ? "neutral" : status.totals.percentBp >= 9000 ? "good" : "warn"}
          sub={`${status.totals.present} of ${status.totals.marked} marked`}
          icon={<Users className="size-4" />}
        />
        <Stat
          label="Absent"
          value={status.totals.absent}
          tone={status.totals.absent > 0 ? "bad" : "good"}
          sub={status.totals.late > 0 ? `${status.totals.late} arrived late` : "no late arrivals"}
        />
        <Stat
          label="On leave"
          value={status.totals.leave}
          sub="sanctioned absence"
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_330px]">
        <Card className="overflow-hidden">
          <CardHead
            title="Sections"
            hint="Tap a section to mark it. Unmarked sections are never shown as present."
            action={
              <Link
                href={`/app/attendance/register?date=${iso}`}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
              >
                <Printer className="size-3.5" /> Monthly register
              </Link>
            }
          />
          {status.rows.length === 0 ? (
            <Empty
              title={isOffice ? "No sections yet" : "You are not a class teacher yet"}
              hint={
                isOffice
                  ? "Create classes and sections, or import your register."
                  : "Attendance is taken by each section's own class teacher. Ask the office if this looks wrong."
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {status.rows.map((r) => (
                <li key={r.sectionId}>
                  <Link
                    href={`/app/attendance/${r.sectionId}?date=${iso}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-light/35"
                  >
                    <div
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg border-2 ${
                        r.isComplete
                          ? "border-good/30 bg-good-light text-good"
                          : r.marked > 0
                            ? "border-marigold/40 bg-marigold-light text-marigold-ink"
                            : "border-line-2 bg-paper-2 text-ink-3"
                      }`}
                    >
                      {r.isComplete ? <CheckCircle2 className="size-4.5" /> : <ClipboardCheck className="size-4.5" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold">{r.label}</p>
                      <p className="mt-0.5 text-[12px] text-ink-3">
                        {r.strength} students
                        {r.teacherName ? ` · ${r.teacherName}` : ""}
                      </p>
                    </div>

                    <div className="w-32 shrink-0">
                      {r.marked === 0 ? (
                        <Badge tone="neutral">Not marked</Badge>
                      ) : (
                        <>
                          <div className="flex items-baseline justify-between">
                            <span className="text-[12px] text-ink-3">
                              {r.absent > 0 ? `${r.absent} absent` : "all in"}
                            </span>
                            <span className="tnum text-[12.5px] font-semibold">
                              {formatPercent(r.percentBp, 0)}
                            </span>
                          </div>
                          <Meter
                            valueBp={r.percentBp}
                            tone={r.percentBp >= 9000 ? "good" : r.percentBp >= 7500 ? "warn" : "bad"}
                            className="mt-1"
                          />
                        </>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          {status.pending.length > 0 ? (
            <Card>
              <CardHead
                title="Still to mark"
                hint="Chase these before the day ends"
                action={<Badge tone="warn">{status.pending.length}</Badge>}
              />
              <ul className="divide-y divide-line">
                {status.pending.slice(0, 10).map((p) => (
                  <li key={p.sectionId} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div>
                      <p className="text-[13.5px] font-medium">{p.label}</p>
                      <p className="text-[11.5px] text-ink-3">{p.teacherName ?? "no class teacher"}</p>
                    </div>
                    <Link
                      href={`/app/attendance/${p.sectionId}?date=${iso}`}
                      className="text-[13px] font-semibold text-brand hover:underline"
                    >
                      Mark
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHead
              title="Absent today"
              hint={
                absentees.length > 0
                  ? "Parents are notified automatically the same morning"
                  : "Nobody absent so far"
              }
            />
            {absentees.length === 0 ? (
              <Empty title={status.totals.marked === 0 ? "Nothing marked yet" : "Full attendance"} />
            ) : (
              <ul className="divide-y divide-line">
                {absentees.map((a) => (
                  <li key={a.id} className="px-5 py-2.5">
                    <Link
                      href={`/app/students/${a.student!.id}`}
                      className="text-[13.5px] font-medium hover:text-brand hover:underline"
                    >
                      {a.student!.name}
                    </Link>
                    <p className="mt-0.5 text-[11.5px] text-ink-3">
                      {a.student!.class?.name}
                      {a.student!.section ? ` ${a.student!.section.name}` : ""}
                      {a.student!.guardianPhone ? ` · ${a.student!.guardianPhone}` : ""}
                    </p>
                  </li>
                ))}
                {status.totals.absent > absentees.length ? (
                  <li className="px-5 py-2 text-[12.5px] text-ink-3">
                    and {status.totals.absent - absentees.length} more
                  </li>
                ) : null}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
