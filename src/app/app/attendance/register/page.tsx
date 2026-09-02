import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole, hasRole, OFFICE, TEACHING } from "@/lib/session";
import { getMonthlyRegister } from "@/lib/queries/attendance";
import { getClassOptions } from "@/lib/queries/students";
import { db } from "@/lib/db";
import { formatPercent } from "@/lib/core/grading-core";
import { Card, CardHead, Empty, PageHead } from "@/components/ui/primitives";
import { PrintButton } from "@/app/app/fees/receipt/print-button";

export const metadata = { title: "Attendance register — Flanca" };

const MARK: Record<string, { glyph: string; className: string }> = {
  PRESENT: { glyph: "P", className: "text-good" },
  ABSENT: { glyph: "A", className: "text-overdue font-semibold" },
  LATE: { glyph: "L", className: "text-marigold-ink" },
  HALF_DAY: { glyph: "½", className: "text-marigold-ink" },
  LEAVE: { glyph: "LV", className: "text-ink-3" },
  HOLIDAY: { glyph: "—", className: "text-ink-3" },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ sectionId?: string; month?: string }>;
}) {
  const actor = await requireRole(...TEACHING);
  const sp = await searchParams;

  const allClasses = await getClassOptions(actor.schoolId);

  // A class teacher may only print their own section's register — office sees
  // every section, same convention as the rest of this module.
  const isOffice = hasRole(actor, ...OFFICE);
  const myOwnSectionIds = isOffice
    ? null
    : new Set(
        (
          await db.section.findMany({
            where: { schoolId: actor.schoolId, classTeacherId: actor.id },
            select: { id: true },
          })
        ).map((s) => s.id),
      );
  const classes = myOwnSectionIds
    ? allClasses
        .map((c) => ({ ...c, sections: c.sections.filter((s) => myOwnSectionIds.has(s.id)) }))
        .filter((c) => c.sections.length > 0)
    : allClasses;

  const requestedSectionId = sp.sectionId;
  const sectionId =
    requestedSectionId && (isOffice || myOwnSectionIds?.has(requestedSectionId))
      ? requestedSectionId
      : classes[0]?.sections[0]?.id;

  const now = new Date();
  const [yearStr, monthStr] = (sp.month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`).split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;

  const register = sectionId ? await getMonthlyRegister(actor.schoolId, sectionId, year, month) : null;

  return (
    <>
      <div className="no-print">
        <Link
          href="/app/attendance"
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" /> Attendance
        </Link>

        <PageHead
          eyebrow="Attendance"
          title="Monthly register"
          sub="The page a school prints and files. P present · A absent · L late · LV leave · shaded columns are non-teaching days."
          actions={
            <>
              <form method="get" className="flex flex-wrap items-center gap-2">
                <select
                  name="sectionId"
                  defaultValue={sectionId ?? ""}
                  className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
                >
                  {classes.flatMap((c) =>
                    c.sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {c.name} {s.name}
                      </option>
                    )),
                  )}
                </select>
                <input
                  type="month"
                  name="month"
                  defaultValue={`${year}-${String(month + 1).padStart(2, "0")}`}
                  className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
                />
                <button className="h-9 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold hover:bg-paper-2">
                  Show
                </button>
              </form>
              <PrintButton label="Print register" />
            </>
          }
        />
      </div>

      {!register ? (
        <Card>
          <Empty title="No section selected" hint="Create a class and section first." />
        </Card>
      ) : (
        <Card className="overflow-hidden print:border-0 print:shadow-none">
          <div className="hidden px-5 py-3 text-center print:block">
            <h2 className="font-display text-[16px] font-bold">
              Attendance Register — {register.section.label}
            </h2>
            <p className="text-[12px]">
              {new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
              {register.section.teacherName ? ` · Class teacher: ${register.section.teacherName}` : ""}
            </p>
          </div>

          <div className="no-print">
            <CardHead
              title={register.section.label}
              hint={`${new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}${register.section.teacherName ? ` · ${register.section.teacherName}` : ""}`}
            />
          </div>

          {register.students.length === 0 ? (
            <Empty title="No students in this section" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11.5px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 border border-line bg-paper-2 px-2 py-1.5 text-left">
                      Roll
                    </th>
                    <th className="sticky left-10 z-10 min-w-[150px] border border-line bg-paper-2 px-2 py-1.5 text-left">
                      Student
                    </th>
                    {register.days.map((d) => (
                      <th
                        key={d.day}
                        title={d.holiday ?? undefined}
                        className={`w-6 border border-line px-0.5 py-1.5 text-center font-semibold ${
                          d.nonTeaching || d.holiday ? "bg-paper-2 text-ink-3" : "bg-white"
                        }`}
                      >
                        {d.day}
                      </th>
                    ))}
                    <th className="border border-line bg-paper-2 px-2 py-1.5 text-center">P</th>
                    <th className="border border-line bg-paper-2 px-2 py-1.5 text-center">A</th>
                    <th className="border border-line bg-paper-2 px-2 py-1.5 text-center">%</th>
                  </tr>
                </thead>
                <tbody>
                  {register.students.map((s) => (
                    <tr key={s.id}>
                      <td className="sticky left-0 z-10 border border-line bg-white px-2 py-1 text-center tnum">
                        {s.rollNumber ?? "—"}
                      </td>
                      <td className="sticky left-10 z-10 border border-line bg-white px-2 py-1 whitespace-nowrap">
                        {s.name}
                      </td>
                      {register.days.map((d) => {
                        const status = s.marks.get(d.day);
                        const mark = status ? MARK[status] : null;
                        return (
                          <td
                            key={d.day}
                            className={`border border-line px-0.5 py-1 text-center ${
                              d.nonTeaching || d.holiday ? "bg-paper-2" : ""
                            } ${mark?.className ?? "text-ink-3"}`}
                          >
                            {mark?.glyph ?? ""}
                          </td>
                        );
                      })}
                      <td className="border border-line px-2 py-1 text-center tnum">{s.summary.presentDays}</td>
                      <td className="border border-line px-2 py-1 text-center tnum">{s.summary.absentDays}</td>
                      <td className="border border-line px-2 py-1 text-center tnum font-semibold">
                        {s.summary.workingDays > 0 ? formatPercent(s.summary.percentBp, 0) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="hidden justify-between px-5 pt-10 pb-4 print:flex">
            <div className="text-center">
              <div className="mb-1 h-8 w-40 border-b border-ink" />
              <p className="text-[10.5px]">Class Teacher</p>
            </div>
            <div className="text-center">
              <div className="mb-1 h-8 w-40 border-b border-ink" />
              <p className="text-[10.5px]">Principal</p>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
