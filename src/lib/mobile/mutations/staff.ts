import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import { formatMoney } from "@/lib/core/money";
import {
  canChangeRoles,
  canDeactivateStaff,
  isAssignableRole,
  nextEmployeeId,
  validateStaffDetails,
  type StaffMessage,
} from "@/lib/core/staff-core";
import { computeSalary, defaultAllowances, defaultDeductions, monthLabel } from "@/lib/core/payroll-core";

/**
 * The mobile-API twin of src/app/app/staff/actions.ts and
 * src/app/app/staff/people-actions.ts — same authorization, same validation
 * (staff-core / payroll-core are reused untouched), same db writes and audit
 * trail, just handed an `actor` instead of calling `requireRole()`, and
 * returning a discriminated result instead of `{error}`/`{ok}` so a route
 * handler can turn it into the right HTTP status.
 *
 * revalidatePath is a Next.js page-cache concern with nothing to invalidate
 * for a stateless JSON client, so it is dropped here — everything else is
 * preserved, including that a first/reset password is returned once and
 * never audited.
 */

type Failure = { ok: false; status: number; code: string; message: string };
const notFound = (message: string): Failure => ({ ok: false, status: 404, code: "not_found", message });
const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });
const conflict = (message: string): Failure => ({ ok: false, status: 409, code: "conflict", message });
const forbidden = (message: string): Failure => ({ ok: false, status: 403, code: "forbidden", message });

/**
 * A first password the office can read down a phone line. Groups of four from
 * an alphabet with no 0/O/1/I/L in it, because this gets read aloud and
 * mistyped. Identical to people-actions.ts::firstPassword.
 */
function firstPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}

export type StaffInput = {
  name: string;
  email: string;
  phone?: string | null;
  employeeId?: string | null;
  designation?: string | null;
  department?: string | null;
  qualification?: string | null;
  roles: string[];
  basicPayText?: string | null;
  joiningIso?: string | null;
  dobIso?: string | null;
  gender?: string | null;
  address?: string | null;
};

function paiseFrom(text: string | null | undefined): number | null {
  if (text == null || String(text).trim() === "") return null;
  const cleaned = String(text).replace(/[₹,\s]/g, "");
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  return Math.round(Number(cleaned) * 100);
}

function checkAll(input: StaffInput) {
  const basicPaise = paiseFrom(input.basicPayText);
  if (input.basicPayText && String(input.basicPayText).trim() !== "" && basicPaise == null) {
    return { error: "That salary is not an amount." as const, basicPaise: null, check: null };
  }
  const check = validateStaffDetails({
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    employeeId: input.employeeId ?? null,
    designation: input.designation ?? null,
    roles: input.roles,
    basicPaise,
    joiningIso: input.joiningIso ?? null,
    dobIso: input.dobIso ?? null,
  });
  return { error: null, check, basicPaise };
}

const asDate = (iso: string | null | undefined) =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00.000Z`) : null;

const asGender = (g: string | null | undefined) =>
  g === "MALE" || g === "FEMALE" || g === "OTHER" ? (g as "MALE" | "FEMALE" | "OTHER") : null;

export type CreateStaffResult =
  | Failure
  | {
      ok: true;
      staffId: string;
      employeeId: string;
      firstPassword: string | null;
      reusedLogin: boolean;
      messages: StaffMessage[];
    };

/** Mirrors people-actions.ts::createStaff. */
export async function createStaffForActor(actor: Actor, input: StaffInput): Promise<CreateStaffResult> {
  const { error, check, basicPaise } = checkAll(input);
  if (error) return invalid(error);
  if (!check!.ok) {
    return invalid(check!.messages.find((m) => m.level === "ERROR")!.message);
  }

  const email = input.email.trim().toLowerCase();
  const roles = [...new Set(input.roles.filter(isAssignableRole))] as Role[];

  const existingUser = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, staffProfile: { select: { id: true, schoolId: true } } },
  });
  if (existingUser?.staffProfile) {
    return conflict(
      existingUser.staffProfile.schoolId === actor.schoolId
        ? `${existingUser.name} is already on the staff here.`
        : "Somebody at another school already signs in with that email.",
    );
  }

  const staffIds = await db.staff.findMany({
    where: { schoolId: actor.schoolId },
    select: { employeeId: true },
  });
  const employeeId = input.employeeId?.trim() || nextEmployeeId(staffIds.map((s) => s.employeeId));
  if (staffIds.some((s) => s.employeeId.toLowerCase() === employeeId.toLowerCase())) {
    return conflict(`Employee id ${employeeId} is already used at this school.`);
  }

  const password = existingUser ? null : firstPassword();
  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;

  const made = await db.$transaction(async (tx) => {
    const user = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: { phone: input.phone?.replace(/\D/g, "") || undefined },
          select: { id: true },
        })
      : await tx.user.create({
          data: {
            email,
            name: input.name.trim().replace(/\s+/g, " "),
            phone: input.phone?.replace(/\D/g, "") || null,
            passwordHash,
          },
          select: { id: true },
        });

    for (const role of roles) {
      await tx.schoolRole.upsert({
        where: { userId_schoolId_role: { userId: user.id, schoolId: actor.schoolId, role } },
        create: { userId: user.id, schoolId: actor.schoolId, role },
        update: {},
      });
    }

    return tx.staff.create({
      data: {
        schoolId: actor.schoolId,
        userId: user.id,
        employeeId,
        designation: input.designation?.trim() || null,
        department: input.department?.trim() || null,
        qualification: input.qualification?.trim() || null,
        joiningDate: asDate(input.joiningIso),
        dob: asDate(input.dobIso),
        gender: asGender(input.gender),
        phone: input.phone?.replace(/\D/g, "") || null,
        address: input.address?.trim() || null,
        basicPay: basicPaise,
      },
      select: { id: true },
    });
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "staff.create",
    entity: "Staff",
    entityId: made.id,
    summary:
      `Added ${input.name.trim()} as ${employeeId}, signing in as ${email}, with ${roles.join(", ").toLowerCase()}` +
      (existingUser ? " — they already had a Flanca login, which is unchanged" : "") +
      (basicPaise ? `, basic ${formatMoney(basicPaise)} a month` : ""),
  });

  return {
    ok: true,
    staffId: made.id,
    employeeId,
    firstPassword: password,
    reusedLogin: Boolean(existingUser),
    messages: check!.messages,
  };
}

export type UpdateStaffResult = Failure | { ok: true; staffId: string; messages: StaffMessage[] };

/** Mirrors people-actions.ts::updateStaff. */
export async function updateStaffForActor(
  actor: Actor,
  input: StaffInput & { staffId: string },
): Promise<UpdateStaffResult> {
  const before = await db.staff.findFirst({
    where: { id: input.staffId, schoolId: actor.schoolId },
    select: {
      id: true, employeeId: true, designation: true, department: true, qualification: true,
      basicPay: true, phone: true, address: true, joiningDate: true, dob: true, gender: true,
      userId: true, user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!before) return notFound("That member of staff is not at this school.");

  const { error, check, basicPaise } = checkAll(input);
  if (error) return invalid(error);
  if (!check!.ok) {
    return invalid(check!.messages.find((m) => m.level === "ERROR")!.message);
  }

  const roles = [...new Set(input.roles.filter(isAssignableRole))] as Role[];
  const currentRoles = (
    await db.schoolRole.findMany({
      where: { userId: before.userId, schoolId: actor.schoolId },
      select: { role: true },
    })
  ).map((r) => r.role as string);

  const otherOwners = await db.schoolRole.count({
    where: { schoolId: actor.schoolId, role: "OWNER", userId: { not: before.userId } },
  });
  const roleCheck = canChangeRoles({
    from: currentRoles,
    to: roles,
    otherOwners,
    isSelf: before.userId === actor.id,
  });
  if (!roleCheck.allowed) return forbidden(roleCheck.reason!);

  const email = input.email.trim().toLowerCase();
  if (email !== before.user.email.toLowerCase()) {
    const taken = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (taken && taken.id !== before.userId) return conflict("Somebody else already signs in with that email.");
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: before.userId },
      data: {
        name: input.name.trim().replace(/\s+/g, " "),
        email,
        phone: input.phone?.replace(/\D/g, "") || null,
      },
    });

    await tx.staff.update({
      where: { id: before.id },
      data: {
        designation: input.designation?.trim() || null,
        department: input.department?.trim() || null,
        qualification: input.qualification?.trim() || null,
        joiningDate: asDate(input.joiningIso),
        dob: asDate(input.dobIso),
        gender: asGender(input.gender),
        phone: input.phone?.replace(/\D/g, "") || null,
        address: input.address?.trim() || null,
        basicPay: basicPaise,
      },
    });

    const toAdd = roles.filter((r) => !currentRoles.includes(r));
    const toDrop = currentRoles.filter((r) => !roles.includes(r as Role));
    if (toDrop.length > 0) {
      await tx.schoolRole.deleteMany({
        where: { userId: before.userId, schoolId: actor.schoolId, role: { in: toDrop as Role[] } },
      });
    }
    for (const role of toAdd) {
      await tx.schoolRole.create({ data: { userId: before.userId, schoolId: actor.schoolId, role } });
    }
  });

  const rolesChanged = roles.slice().sort().join(",") !== currentRoles.slice().sort().join(",");
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "staff.update",
    entity: "Staff",
    entityId: before.id,
    summary:
      `Changed ${before.user.name}'s record` +
      (rolesChanged ? `. Roles are now ${roles.join(", ").toLowerCase()}, were ${currentRoles.join(", ").toLowerCase()}` : "") +
      (email !== before.user.email.toLowerCase() ? `. Signs in as ${email} now, was ${before.user.email}` : ""),
    before: {
      name: before.user.name, email: before.user.email, roles: currentRoles,
      designation: before.designation, basicPay: before.basicPay,
    },
    after: {
      name: input.name.trim(), email, roles,
      designation: input.designation?.trim() ?? null, basicPay: basicPaise,
    },
    reversible: true,
  });

  return { ok: true, staffId: before.id, messages: check!.messages };
}

export type SetStaffActiveResult = Failure | { ok: true };

/** Mirrors people-actions.ts::setStaffActive. */
export async function setStaffActiveForActor(
  actor: Actor,
  input: { staffId: string; isActive: boolean },
): Promise<SetStaffActiveResult> {
  const staff = await db.staff.findFirst({
    where: { id: input.staffId, schoolId: actor.schoolId },
    select: {
      id: true, isActive: true, userId: true,
      user: { select: { name: true } },
      _count: { select: { timetable: true } },
    },
  });
  if (!staff) return notFound("That member of staff is not at this school.");
  if (staff.isActive === input.isActive) return { ok: true };

  if (!input.isActive) {
    const [sections, owners, roles] = await Promise.all([
      db.section.count({ where: { schoolId: actor.schoolId, classTeacherId: staff.userId } }),
      db.schoolRole.count({ where: { schoolId: actor.schoolId, role: "OWNER", userId: { not: staff.userId } } }),
      db.schoolRole.findMany({
        where: { userId: staff.userId, schoolId: actor.schoolId },
        select: { role: true },
      }),
    ]);
    const check = canDeactivateStaff({
      classTeacherOfSections: sections,
      timetablePeriods: staff._count.timetable,
      isLastOwner: roles.some((r) => r.role === "OWNER") && owners === 0,
    });
    if (!check.allowed) return forbidden(check.reason!);

    await db.$transaction([
      db.staff.update({ where: { id: staff.id }, data: { isActive: false } }),
      db.schoolRole.deleteMany({ where: { userId: staff.userId, schoolId: actor.schoolId } }),
    ]);

    await audit({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: "staff.leave",
      entity: "Staff",
      entityId: staff.id,
      summary: `${staff.user.name} has left the school. Their ${roles.length === 1 ? "role" : "roles"} (${roles
        .map((r) => r.role.toLowerCase())
        .join(", ")}) went with them, so they can no longer open anything here.`,
      before: { isActive: true, roles: roles.map((r) => r.role) },
      after: { isActive: false, roles: [] },
      reversible: true,
    });
  } else {
    await db.staff.update({ where: { id: staff.id }, data: { isActive: true } });
    await audit({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: "staff.rejoin",
      entity: "Staff",
      entityId: staff.id,
      summary: `${staff.user.name} is back on the staff. Give them their roles again — coming back does not restore them.`,
    });
  }

  return { ok: true };
}

export type ResetStaffPasswordResult = Failure | { ok: true; firstPassword: string };

/** Mirrors people-actions.ts::resetStaffPassword. */
export async function resetStaffPasswordForActor(
  actor: Actor,
  input: { staffId: string },
): Promise<ResetStaffPasswordResult> {
  const staff = await db.staff.findFirst({
    where: { id: input.staffId, schoolId: actor.schoolId },
    select: { id: true, userId: true, user: { select: { name: true, email: true } } },
  });
  if (!staff) return notFound("That member of staff is not at this school.");

  const password = firstPassword();
  await db.user.update({
    where: { id: staff.userId },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "staff.password.reset",
    entity: "Staff",
    entityId: staff.id,
    summary: `Set a new password for ${staff.user.name} (${staff.user.email}). The password itself is not recorded anywhere.`,
  });

  return { ok: true, firstPassword: password };
}

export type GeneratePayrollResult = Failure | { ok: true; written: number; total: number };

/** Mirrors staff/actions.ts::generatePayroll. */
export async function generatePayrollForActor(
  actor: Actor,
  input: { month: number; year: number },
): Promise<GeneratePayrollResult> {
  if (input.month < 1 || input.month > 12) return invalid("That is not a valid month.");

  const monthStart = new Date(Date.UTC(input.year, input.month - 1, 1));
  const monthEnd = new Date(Date.UTC(input.year, input.month, 0));
  if (monthStart > new Date()) return invalid("That month has not started yet.");

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

  return { ok: true, written, total };
}

export type MarkSalariesPaidResult = Failure | { ok: true; count: number };

/** Mirrors staff/actions.ts::markSalariesPaid. */
export async function markSalariesPaidForActor(
  actor: Actor,
  input: { month: number; year: number; mode: string },
): Promise<MarkSalariesPaidResult> {
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

  return { ok: true, count: result.count };
}
