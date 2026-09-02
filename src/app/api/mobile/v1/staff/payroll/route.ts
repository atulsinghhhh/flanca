import { z } from "zod";
import { db } from "@/lib/db";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { generatePayrollForActor } from "@/lib/mobile/mutations/staff";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/app/app/staff/payroll/page.tsx's salary-register query. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const sp = new URL(req.url).searchParams;

  const now = new Date();
  const month = Number(sp.get("month") ?? now.getUTCMonth() + 1);
  const year = Number(sp.get("year") ?? now.getUTCFullYear());
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    return apiError(422, "invalid_input", "Pass a valid month (1-12) and year.");
  }

  const rows = await db.staffSalary.findMany({
    where: { schoolId: actor.schoolId, month, year },
    orderBy: { staff: { employeeId: "asc" } },
    include: { staff: { include: { user: { select: { name: true } } } } },
  });

  const netTotal = rows.reduce((a, r) => a + r.netPay, 0);
  const paidCount = rows.filter((r) => r.paidAt).length;

  return apiOk({
    month,
    year,
    rows: rows.map((r) => ({
      staffId: r.staffId,
      employeeId: r.staff.employeeId,
      name: r.staff.user.name,
      daysPresent: r.daysPresent,
      daysPayable: r.daysPayable,
      basic: r.basic,
      allowances: r.allowances,
      deductions: r.deductions,
      netPay: r.netPay,
      paidAt: r.paidAt,
      mode: r.mode,
    })),
    summary: {
      staffOnRegister: rows.length,
      netPayable: netTotal,
      paidCount,
      unpaidCount: rows.length - paidCount,
    },
  });
});

const Body = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int(),
});

/** Mirrors src/app/app/staff/actions.ts::generatePayroll. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await generatePayrollForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ written: result.written, total: result.total });
});
