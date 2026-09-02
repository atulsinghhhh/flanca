"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { computeSalary, defaultAllowances, defaultDeductions, monthLabel } from "@/lib/core/payroll-core";
import { formatMoney } from "@/lib/core/money";

/**
 * Build the month's salary register from staff attendance.
 *
 * Idempotent: running it twice produces the same rows, so an office can
 * regenerate after correcting an attendance mistake without creating duplicates.
 */
export async function generatePayroll(input: { month: number; year: number }) {
  const actor = await requireRole(...OFFICE);

  if (input.month < 1 || input.month > 12) return { error: "That is not a valid month." };

  const monthStart = new Date(Date.UTC(input.year, input.month - 1, 1));
  const monthEnd = new Date(Date.UTC(input.year, input.month, 0));
  if (monthStart > new Date()) return { error: "That month has not started yet." };

  const [staff, attendance, advances] = await Promise.all([
    db.staff.findMany({ where: { schoolId: actor.schoolId, isActive: true }, include: { user: true } }),
    db.attendance.findMany({
      where: {
        schoolId: actor.schoolId,
        staffId: { not: null },
        date: { gte: monthStart, lte: monthEnd },
      },
      select: { staffId: true, status: true },
    }),
    db.staffAdvance.findMany({
      where: { schoolId: actor.schoolId, closedAt: null },
      select: { id: true, staffId: true, amount: true, recovered: true },
    }),
  ]);

  const markedByStaff = new Map<string, { payable: number; present: number }>();
  for (const a of attendance) {
    const acc = markedByStaff.get(a.staffId!) ?? { payable: 0, present: 0 };
    if (a.status !== "HOLIDAY") {
      acc.payable += 1;
      if (a.status === "PRESENT" || a.status === "LATE" || a.status === "LEAVE") acc.present += 1;
      if (a.status === "HALF_DAY") acc.present += 0.5;
    }
    markedByStaff.set(a.staffId!, acc);
  }

  const advanceByStaff = new Map<string, number>();
  for (const adv of advances) {
    advanceByStaff.set(adv.staffId, (advanceByStaff.get(adv.staffId) ?? 0) + (adv.amount - adv.recovered));
  }

  let written = 0;
  let total = 0;

  for (const s of staff) {
    const basic = s.basicPay ?? 0;
    if (basic <= 0) continue;

    const days = markedByStaff.get(s.id);
    const breakdown = computeSalary({
      basic,
      allowances: defaultAllowances(basic),
      deductions: defaultDeductions(basic),
      daysPayable: days?.payable ?? 0,
      daysPresent: days?.present ?? days?.payable ?? 0,
      advanceOutstanding: advanceByStaff.get(s.id) ?? 0,
      advanceRecovery: 0,
    });

    await db.staffSalary.upsert({
      where: { staffId_month_year: { staffId: s.id, month: input.month, year: input.year } },
      create: {
        schoolId: actor.schoolId,
        staffId: s.id,
        month: input.month,
        year: input.year,
        basic: breakdown.proratedBasic,
        allowances: breakdown.allowances as never,
        deductions: breakdown.deductions as never,
        daysPresent: Math.round(days?.present ?? 0),
        daysPayable: days?.payable ?? 0,
        netPay: breakdown.netPay,
      },
      update: {
        basic: breakdown.proratedBasic,
        allowances: breakdown.allowances as never,
        deductions: breakdown.deductions as never,
        daysPresent: Math.round(days?.present ?? 0),
        daysPayable: days?.payable ?? 0,
        netPay: breakdown.netPay,
      },
    });

    written++;
    total += breakdown.netPay;
  }

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "payroll.generate",
    entity: "School",
    entityId: actor.schoolId,
    summary: `Built the salary register for ${monthLabel(input.month, input.year)}: ${written} staff, ${formatMoney(total)} net`,
  });

  revalidatePath("/app/staff/payroll");
  return { ok: true, written, total };
}

/** Mark a month's salaries as paid. */
export async function markSalariesPaid(input: { month: number; year: number; mode: string }) {
  const actor = await requireRole(...OFFICE);

  const result = await db.staffSalary.updateMany({
    where: { schoolId: actor.schoolId, month: input.month, year: input.year, paidAt: null },
    data: { paidAt: new Date(), mode: input.mode as never },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "payroll.pay",
    entity: "School",
    entityId: actor.schoolId,
    summary: `Marked ${result.count} salaries paid for ${monthLabel(input.month, input.year)} by ${input.mode}`,
  });

  revalidatePath("/app/staff/payroll");
  return { ok: true, count: result.count };
}

/** A salary advance given to a member of staff, recovered from later net pay. */
export async function recordStaffAdvance(input: { staffId: string; amountText: string; reason?: string | null }) {
  const actor = await requireRole(...OFFICE);

  const cleaned = String(input.amountText ?? "").replace(/[₹,\s]/g, "");
  const amount = Math.round(Number(cleaned) * 100);
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned) || !Number.isFinite(amount) || amount <= 0) {
    return { error: "That is not an amount." };
  }

  const staff = await db.staff.findFirst({
    where: { id: input.staffId, schoolId: actor.schoolId },
    select: { id: true, user: { select: { name: true } } },
  });
  if (!staff) return { error: "That member of staff is not at this school." };

  const advance = await db.staffAdvance.create({
    data: {
      schoolId: actor.schoolId,
      staffId: staff.id,
      amount,
      reason: input.reason?.trim() || null,
      takenOn: new Date(),
    },
    select: { id: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "staff.advance.record",
    entity: "StaffAdvance",
    entityId: advance.id,
    summary:
      `Gave ${staff.user.name} a salary advance of ${formatMoney(amount)}` +
      (input.reason?.trim() ? ` — ${input.reason.trim()}` : ""),
  });

  revalidatePath(`/app/staff/${staff.id}`);
  revalidatePath("/app/staff/payroll");
  return { ok: true as const };
}
