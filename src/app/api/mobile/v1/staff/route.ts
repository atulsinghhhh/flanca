import { z } from "zod";
import { db } from "@/lib/db";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { createStaffForActor } from "@/lib/mobile/mutations/staff";
import { summariseAttendance } from "@/lib/core/attendance-core";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/app/app/staff/page.tsx's staff-directory query. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q") ?? undefined;
  const dept = sp.get("dept") ?? undefined;

  const staff = await db.staff.findMany({
    where: {
      schoolId: actor.schoolId,
      isActive: true,
      ...(dept ? { department: dept } : {}),
      ...(q
        ? {
            OR: [
              { user: { name: { contains: q, mode: "insensitive" } } },
              { employeeId: { contains: q, mode: "insensitive" } },
              { designation: { contains: q, mode: "insensitive" } },
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

  const items = staff.map((s) => {
    const att = summariseAttendance(s.attendance as never);
    return {
      staffId: s.id,
      employeeId: s.employeeId,
      name: s.user.name,
      email: s.user.email,
      designation: s.designation,
      department: s.department,
      subjects: s.subjects.map((x) => x.subject.name),
      phone: s.phone,
      basicPay: s.basicPay,
      pendingLeaveRequests: s._count.leaveRequests,
      attendance:
        att.workingDays > 0 ? { percentBp: att.percentBp, workingDays: att.workingDays } : null,
    };
  });

  return apiOk({
    staff: items,
    summary: {
      onStrength: staff.length,
      departments,
      monthlyBasicWageBill: monthlyWage,
      pendingLeaveRequests: staff.reduce((a, s) => a + s._count.leaveRequests, 0),
    },
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

/** Mirrors src/app/app/staff/people-actions.ts::createStaff. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = StaffInputSchema.parse(await req.json());

  const result = await createStaffForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk(
    {
      staffId: result.staffId,
      employeeId: result.employeeId,
      firstPassword: result.firstPassword,
      reusedLogin: result.reusedLogin,
      messages: result.messages,
    },
    201,
  );
});
