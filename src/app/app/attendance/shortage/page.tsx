import Link from "next/link";
import { ArrowLeft, Phone, TriangleAlert } from "lucide-react";
import { requireRole, hasRole, OFFICE, TEACHING } from "@/lib/session";
import { getShortageReport } from "@/lib/queries/attendance";
import { db } from "@/lib/db";
import { formatPercent } from "@/lib/core/grading-core";
import { Badge, Card, CardHead, Empty, Meter, PageHead, Stat } from "@/components/ui/primitives";

export const metadata = { title: "Attendance shortage — Flanca" };

export default async function ShortagePage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  const actor = await requireRole(...TEACHING);
  const sp = await searchParams;
  const required = Math.min(100, Math.max(50, Number(sp.required ?? 75) || 75));

  // A teacher sees only the sections they are class teacher of, same as the
  // attendance list itself — this is a phone-number report, not a school directory.
  const onlySectionIds = hasRole(actor, ...OFFICE)
    ? undefined
    : (
        await db.section.findMany({
          where: { schoolId: actor.schoolId, classTeacherId: actor.id },
          select: { id: true },
        })
      ).map((s) => s.id);

  const report = await getShortageReport(actor.schoolId, required, onlySectionIds);

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
        title={`Below ${required}% attendance`}
        sub="Boards require a minimum attendance to sit an exam. A shortage found in November is a conversation; found in March it is a crisis — so this projects forward from the days still left."
        actions={
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="required" className="text-[13px] text-ink-2">
              Requirement
            </label>
            <select
              id="required"
              name="required"
              defaultValue={String(required)}
              className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
            >
              {[60, 70, 75, 80, 85].map((v) => (
                <option key={v} value={v}>
                  {v}%
                </option>
              ))}
            </select>
            <button className="h-9 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold hover:bg-paper-2">
              Apply
            </button>
          </form>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Students short"
          value={report.rows.length}
          tone={report.rows.length > 0 ? "warn" : "good"}
          sub={`below ${required}% today`}
        />
        <Stat
          label="Cannot recover"
          value={report.unreachable}
          tone={report.unreachable > 0 ? "bad" : "good"}
          sub={`${required}% is arithmetically out of reach`}
        />
        <Stat
          label="Still recoverable"
          value={report.rows.length - report.unreachable}
          tone="warn"
          sub="can reach the mark if they attend"
        />
      </div>

      <Card className="mt-5 overflow-hidden">
        <CardHead
          title="Who needs a phone call"
          hint="Worst first. The last column is exactly how many of the remaining days the student must attend."
        />
        {report.rows.length === 0 ? (
          <Empty
            title={`Nobody is below ${required}%`}
            hint="Every student on the roll is comfortably eligible."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="ruled w-full min-w-[860px]">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Parent mobile</th>
                  <th className="num">Present</th>
                  <th className="num">Working days</th>
                  <th className="w-40">Attendance</th>
                  <th className="num">Must attend</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.id}>
                    <td data-title>
                      <Link
                        href={`/app/students/${r.id}`}
                        className="font-medium hover:text-brand hover:underline"
                      >
                        {r.name}
                      </Link>
                      <p className="font-mono text-[11.5px] text-ink-3">{r.admissionNumber}</p>
                    </td>
                    <td data-label="Class" className="whitespace-nowrap text-ink-2">
                      {r.className}
                      {r.sectionName ? ` ${r.sectionName}` : ""}
                    </td>
                    <td data-label="Parent mobile">
                      {r.phone ? (
                        <a
                          href={`tel:${r.phone}`}
                          className="inline-flex items-center gap-1 font-mono text-[12px] text-ink-2 hover:text-brand"
                        >
                          <Phone className="size-3" /> {r.phone}
                        </a>
                      ) : (
                        <span className="text-[12px] text-overdue">no mobile</span>
                      )}
                    </td>
                    <td data-label="Present" className="num text-ink-2">{r.summary.presentDays}</td>
                    <td data-label="Working days" className="num text-ink-2">{r.summary.workingDays}</td>
                    <td data-label="Attendance">
                      <div className="flex items-center gap-2">
                        <Meter
                          valueBp={r.summary.percentBp}
                          tone={r.verdict.unreachable ? "bad" : "warn"}
                          className="flex-1"
                        />
                        <span className="tnum w-12 text-right text-[12.5px] font-semibold">
                          {formatPercent(r.summary.percentBp, 0)}
                        </span>
                      </div>
                    </td>
                    <td data-label="Must attend" className="num font-semibold">{r.verdict.daysNeeded}</td>
                    <td data-label="">
                      {r.verdict.unreachable ? (
                        <Badge tone="bad">
                          <TriangleAlert className="size-3" /> Out of reach
                        </Badge>
                      ) : (
                        <Badge tone="warn">Recoverable</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
