import Link from "next/link";
import { IdCard, Phone, UserPlus, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { formatMoney } from "@/lib/core/money";
import { formatPercent } from "@/lib/core/grading-core";
import { summariseAttendance } from "@/lib/core/attendance-core";
import { Badge, ButtonLink, Card, CardHead, Empty, PageHead, Stat } from "@/components/ui/primitives";

export const metadata = { title: "Staff & payroll — Flanca" };

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string }>;
}) {
  const actor = await requireRole(...OFFICE);
  const sp = await searchParams;

  const staff = await db.staff.findMany({
    where: {
      schoolId: actor.schoolId,
      isActive: true,
      ...(sp.dept ? { department: sp.dept } : {}),
      ...(sp.q
        ? {
            OR: [
              { user: { name: { contains: sp.q, mode: "insensitive" } } },
              { employeeId: { contains: sp.q, mode: "insensitive" } },
              { designation: { contains: sp.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { employeeId: "asc" },
    include: {
      user: { select: { name: true, email: true } },
      attendance: { select: { status: true, date: true } },
      subjects: { include: { subject: { select: { name: true } } } },
      _count: { select: { leaveRequests: { where: { status: "PENDING" } } } },
    },
  });

  const departments = [...new Set(staff.map((s) => s.department).filter(Boolean))] as string[];
  const monthlyWage = staff.reduce((a, s) => a + (s.basicPay ?? 0), 0);

  return (
    <>
      <PageHead
        eyebrow="School"
        title="Staff"
        sub={`${staff.length} people on strength. Attendance, leave and the monthly salary register in one place.`}
        actions={
          <>
            <ButtonLink href="/app/staff/payroll" variant="secondary" size="sm">
              <Wallet className="size-4" /> Salary register
            </ButtonLink>
            <ButtonLink href="/app/staff/new" size="sm">
              <UserPlus className="size-4" /> Add staff
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="On strength" value={staff.length} sub="active staff" icon={<IdCard className="size-4" />} />
        <Stat
          label="Teaching staff"
          value={staff.filter((s) => s.department === "Academics").length}
          sub={`${departments.length} departments`}
        />
        <Stat label="Monthly basic wage bill" value={formatMoney(monthlyWage)} sub="before allowances" />
        <Stat
          label="Leave requests pending"
          value={staff.reduce((a, s) => a + s._count.leaveRequests, 0)}
          tone={staff.some((s) => s._count.leaveRequests > 0) ? "warn" : "good"}
        />
      </div>

      <Card className="mt-5 overflow-hidden">
        <CardHead title="Staff list" />

        <form method="get" className="flex flex-wrap items-end gap-2.5 border-b border-line px-5 py-3">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="q" className="eyebrow text-ink-3 mb-1 block">
              Search
            </label>
            <input
              id="q"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Name, employee ID or designation"
              className="h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
            />
          </div>
          <div>
            <label htmlFor="dept" className="eyebrow text-ink-3 mb-1 block">
              Department
            </label>
            <select
              id="dept"
              name="dept"
              defaultValue={sp.dept ?? ""}
              className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
            >
              <option value="">All</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <button className="h-9 rounded-md bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-dark">
            Apply
          </button>
          {sp.q || sp.dept ? (
            <Link href="/app/staff" className="h-9 px-2 pt-2 text-[13px] font-semibold text-ink-3 hover:text-ink">
              Clear
            </Link>
          ) : null}
        </form>

        {staff.length === 0 ? (
          <Empty title="No staff match this filter" />
        ) : (
          <div className="overflow-x-auto">
            <table className="ruled w-full min-w-[880px]">
              <thead>
                <tr>
                  <th>Emp. ID</th>
                  <th>Name</th>
                  <th>Designation</th>
                  <th>Department</th>
                  <th>Subjects</th>
                  <th>Mobile</th>
                  <th className="num">Attendance</th>
                  <th className="num">Basic</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const att = summariseAttendance(s.attendance as never);
                  return (
                    <tr key={s.id}>
                      <td data-label="Emp. ID" className="font-mono text-[12.5px] whitespace-nowrap text-ink-2">{s.employeeId}</td>
                      <td data-title>
                        <Link
                          href={`/app/staff/${s.id}`}
                          className="font-medium hover:text-brand hover:underline"
                        >
                          {s.user.name}
                        </Link>
                      </td>
                      <td data-label="Designation" className="whitespace-nowrap text-ink-2">{s.designation ?? "—"}</td>
                      <td data-label="Department" className="whitespace-nowrap text-ink-2">{s.department ?? "—"}</td>
                      <td data-label="Subjects" className="max-w-[200px] truncate text-[12.5px] text-ink-3">
                        {s.subjects.length > 0
                          ? s.subjects.map((x) => x.subject.name).join(", ")
                          : "—"}
                      </td>
                      <td data-label="Mobile" className="font-mono text-[12px] whitespace-nowrap text-ink-2">{s.phone ?? "—"}</td>
                      <td data-label="Attendance" className="num">
                        {att.workingDays > 0 ? (
                          <span className={att.percentBp >= 9000 ? "text-good" : "text-marigold-ink"}>
                            {formatPercent(att.percentBp, 0)}
                          </span>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                      <td data-label="Basic" className="num">{s.basicPay ? formatMoney(s.basicPay) : "—"}</td>
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
