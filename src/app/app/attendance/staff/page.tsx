import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole, OFFICE } from "@/lib/session";
import { resolveDay, isoDay } from "@/lib/queries/when";
import { getStaffAttendance } from "@/lib/queries/attendance";
import { Card, Empty, PageHead, Stat } from "@/components/ui/primitives";
import { StaffSheet } from "./staff-sheet";

export const metadata = { title: "Staff attendance — Flanca" };

export default async function StaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const actor = await requireRole(...OFFICE);
  const { date } = await searchParams;

  const when = resolveDay(date);

  const sheet = await getStaffAttendance(actor.schoolId, when);
  const iso = isoDay(sheet.date);

  return (
    <>
      <Link
        href="/app/attendance"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Attendance
      </Link>

      <PageHead
        eyebrow="Attendance"
        title="Staff attendance"
        sub={sheet.date.toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="On strength" value={sheet.totals.strength} sub="active staff" />
        <Stat label="Present" value={sheet.totals.present} tone="good" sub="including late arrivals" />
        <Stat label="Absent" value={sheet.totals.absent} tone={sheet.totals.absent > 0 ? "bad" : "good"} />
        <Stat
          label="Not marked"
          value={sheet.totals.unmarked}
          tone={sheet.totals.unmarked > 0 ? "warn" : "good"}
          sub={sheet.totals.unmarked > 0 ? "defaults to present until saved" : "all marked"}
        />
      </div>

      <div className="mt-5">
        {sheet.rows.length === 0 ? (
          <Card>
            <Empty title="No staff on record" hint="Add staff from the Staff & payroll screen." />
          </Card>
        ) : (
          <StaffSheet date={iso} rows={sheet.rows} />
        )}
      </div>
    </>
  );
}
