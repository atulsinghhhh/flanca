import { z } from "zod";
import { db } from "@/lib/db";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { updateStaffForActor } from "@/lib/mobile/mutations/staff";
import { summariseAttendance } from "@/lib/core/attendance-core";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

/** Mirrors src/app/app/staff/[id]/page.tsx's staff-detail query. */
export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
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
  if (!staff) return apiError(404, "not_found", "That member of staff is not at this school.");

  const att = summariseAttendance(staff.attendance as never);
  const cpdHours = staff.cpdRecords.reduce((a, c) => a + c.hours, 0);
  const advanceOutstanding = staff.advances.reduce((a, x) => a + (x.amount - x.recovered), 0);

  return apiOk({
    staffId: staff.id,
    employeeId: staff.employeeId,
    name: staff.user.name,
    email: staff.user.email,
    phone: staff.user.phone,
    lastLoginAt: staff.user.lastLoginAt,
    isActive: staff.isActive,
    designation: staff.designation,
    department: staff.department,
    qualification: staff.qualification,
    joiningDate: staff.joiningDate,
    dob: staff.dob,
    gender: staff.gender,
    panNumber: staff.panNumber,
    bankAccountNo: staff.bankAccountNo,
    bankIfsc: staff.bankIfsc,
    basicPay: staff.basicPay,
    advanceOutstanding,
    attendance: {
      percentBp: att.percentBp,
      workingDays: att.workingDays,
      presentDays: att.presentDays,
      absentDays: att.absentDays,
      leaveDays: att.leaveDays,
      lateDays: att.lateDays,
      recent: staff.attendance.slice(0, 30),
    },
    subjects: staff.subjects.map((s) => ({ name: s.subject.name, className: s.subject.class?.name ?? null })),
    periodsPerWeek: staff.timetable.length,
    timetable: staff.timetable.map((t) => ({
      dayOfWeek: t.dayOfWeek,
      period: t.period,
      className: t.class?.name ?? null,
      sectionName: t.section?.name ?? null,
      subjectName: t.subject?.name ?? null,
    })),
    salaries: staff.salaries,
    leaveRequests: staff.leaveRequests,
    tasks: staff.tasks,
    cpdRecords: staff.cpdRecords,
    cpdHours,
  });
});

const StaffInputSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  phone: z.string().nullish(),
  employeeId: z.string().nullish(),
  designation: z.string().nullish(),
  department: z.string().nullish(),
  qualification: z.string().nullish(),
  roles: z.array(z.string()).min(1),
  basicPayText: z.string().nullish(),
  joiningIso: z.string().nullish(),
  dobIso: z.string().nullish(),
  gender: z.string().nullish(),
  address: z.string().nullish(),
});

/** Mirrors src/app/app/staff/people-actions.ts::updateStaff. */
export const PATCH = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { id } = await params;
  const input = StaffInputSchema.parse(await req.json());

  const result = await updateStaffForActor(actor, { ...input, staffId: id });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ staffId: result.staffId, messages: result.messages });
});
