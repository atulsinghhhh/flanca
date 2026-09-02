import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, CalendarDays, GraduationCap, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { formatMoney } from "@/lib/core/money";
import { formatPercent } from "@/lib/core/grading-core";
import { summariseAttendance } from "@/lib/core/attendance-core";
import { monthLabel } from "@/lib/core/payroll-core";
import { Badge, Card, CardHead, Empty, Meter, PageHead, Stat } from "@/components/ui/primitives";
import { StaffActions } from "../staff-actions";
import { AddAdvance, AddCpd } from "./staff-extras";

export const metadata = { title: "Staff member — Flanca" };

const DATE = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function StaffMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole(...OFFICE);
  const { id } = await params;

  const staff = await db.staff.findFirst({
    where: { id, schoolId: actor.schoolId },
    include: {
      user: { select: { name: true, email: true, phone: true, lastLoginAt: true } },
      subjects: { include: { subject: { select: { name: true, class: { select: { name: true } } } } } },
      attendance: { select: { status: true, date: true }, orderBy: { date: "desc" } },
      leaveRequests: { orderBy: { fromDate: "desc" }, take: 8 },
      salaries: { orderBy: [{ year: "desc" }, { month: "desc" }], take: 6 },
      advances: { where: { closedAt: null } },
      tasks: { where: { completedAt: null }, orderBy: { dueOn: "asc" }, take: 6 },
      cpdRecords: { orderBy: { completedOn: "desc" } },
      timetable: {
        include: { class: { select: { name: true } }, section: { select: { name: true } }, subject: { select: { name: true } } },
        orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
      },
    },
  });
  if (!staff) notFound();

  const att = summariseAttendance(staff.attendance as never);
  const cpdHours = staff.cpdRecords.reduce((a, c) => a + c.hours, 0);
  const advanceOutstanding = staff.advances.reduce((a, x) => a + (x.amount - x.recovered), 0);
  const periodsPerWeek = staff.timetable.length;

  return (
    <>
      <Link
        href="/app/staff"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Staff
      </Link>

      <PageHead
        eyebrow={`${staff.employeeId} · ${staff.designation ?? "Staff"}${staff.department ? ` · ${staff.department}` : ""}`}
        title={staff.user.name}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={staff.isActive ? "good" : "neutral"}>{staff.isActive ? "Active" : "Inactive"}</Badge>
            {staff.phone ? <span className="text-ink-3">{staff.phone}</span> : null}
            {staff.user.email ? <span className="text-ink-3">{staff.user.email}</span> : null}
          </span>
        }
        actions={<StaffActions staffId={staff.id} name={staff.user.name} isActive={staff.isActive} />}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Attendance"
          value={att.workingDays > 0 ? formatPercent(att.percentBp, 1) : "—"}
          tone={att.percentBp >= 9000 ? "good" : "warn"}
          sub={`${att.presentDays} of ${att.workingDays} days`}
          icon={<CalendarDays className="size-4" />}
        />
        <Stat
          label="Periods a week"
          value={periodsPerWeek}
          sub={`${staff.subjects.length} subjects assigned`}
          icon={<BookOpen className="size-4" />}
        />
        <Stat
          label="Monthly basic"
          value={staff.basicPay ? formatMoney(staff.basicPay) : "—"}
          sub={advanceOutstanding > 0 ? `${formatMoney(advanceOutstanding)} advance outstanding` : "no advance outstanding"}
          icon={<Wallet className="size-4" />}
        />
        <Stat
          label="CPD hours"
          value={cpdHours}
          tone={cpdHours >= 50 ? "good" : "warn"}
          sub="NEP asks for 50 hours a year"
          icon={<GraduationCap className="size-4" />}
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHead title="Details" />
            <dl className="divide-y divide-line">
              <Row label="Employee ID" value={staff.employeeId} />
              <Row label="Designation" value={staff.designation ?? "—"} />
              <Row label="Department" value={staff.department ?? "—"} />
              <Row label="Qualification" value={staff.qualification ?? "—"} />
              <Row label="Joined" value={DATE(staff.joiningDate)} />
              <Row label="Date of birth" value={DATE(staff.dob)} />
              <Row label="PAN" value={staff.panNumber ?? "—"} />
              <Row label="Bank account" value={staff.bankAccountNo ? `••••${staff.bankAccountNo.slice(-4)}` : "—"} />
              <Row label="IFSC" value={staff.bankIfsc ?? "—"} />
              <Row label="Last signed in" value={DATE(staff.user.lastLoginAt)} />
            </dl>
          </Card>

          <Card>
            <CardHead title="Subjects taught" />
            {staff.subjects.length === 0 ? (
              <Empty title="No subjects assigned" />
            ) : (
              <ul className="divide-y divide-line">
                {staff.subjects.map((s) => (
                  <li key={s.id} className="flex justify-between gap-3 px-5 py-2">
                    <span className="text-[13.5px]">{s.subject.name}</span>
                    <span className="text-[12.5px] text-ink-3">{s.subject.class?.name ?? "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHead
              title="Attendance"
              hint={`${att.absentDays} absent · ${att.leaveDays} on leave · ${att.lateDays} late`}
              action={
                <span className="tnum text-[13px] font-semibold">
                  {att.workingDays > 0 ? formatPercent(att.percentBp, 1) : "—"}
                </span>
              }
            />
            <div className="px-5 py-4">
              <Meter valueBp={att.percentBp} tone={att.percentBp >= 9000 ? "good" : "warn"} />
              <div className="mt-3 flex flex-wrap gap-1">
                {staff.attendance.slice(0, 30).reverse().map((a, i) => (
                  <span
                    key={i}
                    title={`${DATE(a.date)} · ${a.status.toLowerCase()}`}
                    className={`size-5 rounded-[3px] text-center text-[9px] leading-5 font-semibold ${
                      a.status === "PRESENT"
                        ? "bg-good-light text-good"
                        : a.status === "ABSENT"
                          ? "bg-overdue-light text-overdue"
                          : "bg-marigold-light text-marigold-ink"
                    }`}
                  >
                    {a.status === "PRESENT" ? "P" : a.status === "ABSENT" ? "A" : a.status === "LEAVE" ? "L" : "·"}
                  </span>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Salary history" />
            {staff.salaries.length === 0 ? (
              <Empty title="No salary rows yet" hint="Build the month's register from Staff → Salary register." />
            ) : (
              <div className="overflow-x-auto">
                <table className="ruled w-full min-w-[520px]">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="num">Days</th>
                      <th className="num">Basic</th>
                      <th className="num">Net pay</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.salaries.map((s) => (
                      <tr key={s.id}>
                        <td data-title className="whitespace-nowrap">{monthLabel(s.month, s.year)}</td>
                        <td data-label="Days" className="num text-ink-2">
                          {s.daysPresent ?? "—"}/{s.daysPayable ?? "—"}
                        </td>
                        <td data-label="Basic" className="num">{formatMoney(s.basic)}</td>
                        <td data-label="Net pay" className="num font-semibold">{formatMoney(s.netPay)}</td>
                        <td data-label="Status">
                          {s.paidAt ? (
                            <Badge tone="good">Paid</Badge>
                          ) : (
                            <Badge tone="warn">Unpaid</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHead
              title="Advances"
              hint={advanceOutstanding > 0 ? `${formatMoney(advanceOutstanding)} outstanding` : "None outstanding"}
            />
            {staff.advances.length === 0 ? (
              <Empty title="No advance outstanding" />
            ) : (
              <ul className="divide-y divide-line">
                {staff.advances.map((a) => (
                  <li key={a.id} className="px-5 py-2.5">
                    <p className="text-[13.5px] font-medium">
                      {formatMoney(a.amount - a.recovered)} outstanding
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-ink-3">
                      {formatMoney(a.amount)} taken {DATE(a.takenOn)}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <AddAdvance staffId={staff.id} />
          </Card>

          <div className="grid items-start gap-5 sm:grid-cols-2">
            <Card>
              <CardHead title="Leave" hint="Most recent first" />
              {staff.leaveRequests.length === 0 ? (
                <Empty title="No leave on record" />
              ) : (
                <ul className="divide-y divide-line">
                  {staff.leaveRequests.map((l) => (
                    <li key={l.id} className="px-5 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13.5px] font-medium">{l.kind.toLowerCase()} leave</p>
                        <Badge tone={l.status === "APPROVED" ? "good" : l.status === "REJECTED" ? "bad" : "warn"}>
                          {l.status.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-ink-3">
                        {DATE(l.fromDate)} – {DATE(l.toDate)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHead title="Professional development" hint="NEP asks for 50 hours a year" />
              {staff.cpdRecords.length === 0 ? (
                <Empty title="Nothing recorded" />
              ) : (
                <ul className="divide-y divide-line">
                  {staff.cpdRecords.map((c) => (
                    <li key={c.id} className="px-5 py-2.5">
                      <p className="text-[13.5px] font-medium">{c.title}</p>
                      <p className="mt-0.5 text-[11.5px] text-ink-3">
                        {c.hours} hours · {DATE(c.completedOn)}
                        {c.provider ? ` · ${c.provider}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <AddCpd staffId={staff.id} />
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 px-5 py-2">
      <dt className="w-32 shrink-0 text-[12.5px] text-ink-3">{label}</dt>
      <dd className="truncate text-[13.5px]">{value}</dd>
    </div>
  );
}
