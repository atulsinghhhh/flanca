import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Users } from "lucide-react";
import { requireRole, hasRole, OFFICE, TEACHING } from "@/lib/session";
import { resolveDay, isoDay } from "@/lib/queries/when";
import { getSectionSheet } from "@/lib/queries/attendance";
import { Badge, Card, Empty, PageHead } from "@/components/ui/primitives";
import { MarkSheet } from "./mark-sheet";
import { UnlockButton } from "./unlock-button";

export const metadata = { title: "Mark attendance — Flanca" };

export default async function MarkPage({
  params,
  searchParams,
}: {
  params: Promise<{ sectionId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const actor = await requireRole(...TEACHING);
  const { sectionId } = await params;
  const { date } = await searchParams;

  const when = resolveDay(date);

  const sheet = await getSectionSheet(actor.schoolId, sectionId, when);
  if (!sheet) notFound();

  // The office may mark any section; a teacher only the one they are class
  // teacher of — attendance is that section's own daily register, and nothing
  // here re-derives who "actually teaches" it the way homework or chat reach
  // does, on purpose: the register is one person's job, not everyone who has a
  // period with the class.
  const isOffice = hasRole(actor, ...OFFICE);
  if (!isOffice && sheet.section.classTeacherId !== actor.id) {
    return (
      <>
        <Link
          href="/app/attendance"
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" /> All sections
        </Link>
        <Card>
          <Empty
            title="Not your section"
            hint={`Only ${sheet.section.teacherName ?? "the class teacher"} can mark ${sheet.section.label}.`}
          />
        </Card>
      </>
    );
  }

  const iso = isoDay(sheet.date);
  const alreadyMarked = sheet.students.some((s) => s.status !== null);

  return (
    <>
      <Link
        href="/app/attendance"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> All sections
      </Link>

      <PageHead
        eyebrow={`${sheet.students.length} students${sheet.section.teacherName ? ` · class teacher ${sheet.section.teacherName}` : ""}`}
        title={sheet.section.label}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-ink-2">
              <CalendarDays className="size-3.5" />
              {sheet.date.toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            {alreadyMarked ? (
              <Badge tone="good">
                Marked{sheet.markedBy ? ` by ${sheet.markedBy}` : ""}
                {sheet.markedAt
                  ? ` at ${sheet.markedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
                  : ""}
              </Badge>
            ) : (
              <Badge tone="warn">Not marked yet</Badge>
            )}
            {sheet.locked ? (
              <Badge tone="neutral">
                Locked{sheet.lockedBy ? ` by ${sheet.lockedBy}` : ""}
              </Badge>
            ) : null}
            {sheet.locked && isOffice ? (
              <UnlockButton sectionId={sheet.section.id} date={iso} />
            ) : null}
          </span>
        }
        actions={
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
        }
      />

      {sheet.students.length === 0 ? (
        <Card>
          <Empty
            title="No students in this section"
            hint="Add students to this section, or import your register."
          />
        </Card>
      ) : (
        <MarkSheet
          sectionId={sheet.section.id}
          date={iso}
          alreadyMarked={alreadyMarked}
          students={sheet.students}
          locked={sheet.locked && !isOffice}
        />
      )}
    </>
  );
}
