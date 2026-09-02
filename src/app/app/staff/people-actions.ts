"use server";

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { formatMoney } from "@/lib/core/money";
import {
  canChangeRoles, canDeactivateStaff, isAssignableRole,
  nextEmployeeId, validateStaffDetails,
} from "@/lib/core/staff-core";

/**
 * The school's own people.
 *
 * Until now a school could not add a member of staff at all — the seed created
 * every teacher, clerk and principal — so a real school's first day had nobody to
 * mark a register, enter a mark, take a fee or answer a parent.
 *
 * Three things this has to get right, and none of them are the form:
 *
 * 1. **A login is the point.** Staff without a login is a personnel list, not a
 *    school system. So creating a member of staff creates the account, and the
 *    office is handed a first password once, to pass on.
 * 2. **The password is shown, never stored in the clear and never audited.** It is
 *    returned to the screen that asked for it and nowhere else. The audit trail
 *    records that an account was made and with which roles — never the secret.
 * 3. **A person can already exist.** One user may hold roles in two schools, and
 *    User.email is unique across all of them, so an email that is already in use is
 *    often somebody joining a second school rather than a mistake. That case adds
 *    them here and leaves their password alone.
 */

/**
 * A first password the office can read down a phone line.
 *
 * Groups of four from an alphabet with no 0/O/1/I/L in it, because this gets read
 * aloud and mistyped. 26 characters of entropy, and it is meant to be changed.
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
  panNumber?: string | null;
  bankAccountNo?: string | null;
  bankIfsc?: string | null;
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
    return { error: "That salary is not an amount." as const, basicPaise: null };
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
  return { check, basicPaise };
}

const asDate = (iso: string | null | undefined) =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00.000Z`) : null;

const asGender = (g: string | null | undefined) =>
  g === "MALE" || g === "FEMALE" || g === "OTHER" ? (g as "MALE" | "FEMALE" | "OTHER") : null;

export async function createStaff(input: StaffInput) {
  const actor = await requireRole(...OFFICE);

  const { error, check, basicPaise } = checkAll(input);
  if (error) return { error };
  if (!check!.ok) {
    return { error: check!.messages.find((m) => m.level === "ERROR")!.message, messages: check!.messages };
  }

  const email = input.email.trim().toLowerCase();
  const roles = [...new Set(input.roles.filter(isAssignableRole))] as Role[];

  const existingUser = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, staffProfile: { select: { id: true, schoolId: true } } },
  });
  if (existingUser?.staffProfile) {
    return {
      error:
        existingUser.staffProfile.schoolId === actor.schoolId
          ? `${existingUser.name} is already on the staff here.`
          : "Somebody at another school already signs in with that email.",
    };
  }

  const staffIds = await db.staff.findMany({
    where: { schoolId: actor.schoolId },
    select: { employeeId: true },
  });
  const employeeId = input.employeeId?.trim() || nextEmployeeId(staffIds.map((s) => s.employeeId));
  if (staffIds.some((s) => s.employeeId.toLowerCase() === employeeId.toLowerCase())) {
    return { error: `Employee id ${employeeId} is already used at this school.`, messages: check!.messages };
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
        panNumber: input.panNumber?.trim().toUpperCase() || null,
        bankAccountNo: input.bankAccountNo?.replace(/\s+/g, "") || null,
        bankIfsc: input.bankIfsc?.trim().toUpperCase() || null,
      },
      select: { id: true, userId: true },
    });
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "staff.create",
    entity: "Staff",
    entityId: made.id,
    // The roles are the consequential part and belong on the record. The password
    // does not, in any form.
    summary:
      `Added ${input.name.trim()} as ${employeeId}, signing in as ${email}, with ${roles.join(", ").toLowerCase()}` +
      (existingUser ? " — they already had a Flanca login, which is unchanged" : "") +
      (basicPaise ? `, basic ${formatMoney(basicPaise)} a month` : ""),
  });

  revalidatePath("/app/staff");
  return {
    ok: true as const,
    staffId: made.id,
    userId: made.userId,
    employeeId,
    firstPassword: password,
    reusedLogin: Boolean(existingUser),
    messages: check!.messages,
  };
}

export async function updateStaff(input: StaffInput & { staffId: string }) {
  const actor = await requireRole(...OFFICE);

  const before = await db.staff.findFirst({
    where: { id: input.staffId, schoolId: actor.schoolId },
    select: {
      id: true, employeeId: true, designation: true, department: true, qualification: true,
      basicPay: true, phone: true, address: true, joiningDate: true, dob: true, gender: true,
      userId: true, user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!before) return { error: "That member of staff is not at this school." };

  const { error, check, basicPaise } = checkAll(input);
  if (error) return { error };
  if (!check!.ok) {
    return { error: check!.messages.find((m) => m.level === "ERROR")!.message, messages: check!.messages };
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
  if (!roleCheck.allowed) return { error: roleCheck.reason! };

  // The email is the login, so changing it changes how somebody signs in. Allowed,
  // but only into an address nobody else is using.
  const email = input.email.trim().toLowerCase();
  if (email !== before.user.email.toLowerCase()) {
    const taken = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (taken && taken.id !== before.userId) return { error: "Somebody else already signs in with that email." };
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
        panNumber: input.panNumber?.trim().toUpperCase() || null,
        bankAccountNo: input.bankAccountNo?.replace(/\s+/g, "") || null,
        bankIfsc: input.bankIfsc?.trim().toUpperCase() || null,
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

  revalidatePath("/app/staff");
  revalidatePath(`/app/staff/${before.id}`);
  return { ok: true as const, staffId: before.id, messages: check!.messages };
}

/**
 * Somebody joining or leaving.
 *
 * Leaving is guarded, because nothing in this product revokes a role when staff go
 * inactive: a departed class teacher would keep a section's parents messaging an
 * empty chair, and a departed principal would keep reading every conversation in
 * the school. Their roles go with them.
 */
export async function setStaffActive(input: { staffId: string; isActive: boolean }) {
  const actor = await requireRole(...OFFICE);

  const staff = await db.staff.findFirst({
    where: { id: input.staffId, schoolId: actor.schoolId },
    select: {
      id: true, isActive: true, userId: true,
      user: { select: { name: true } },
      _count: { select: { timetable: true } },
    },
  });
  if (!staff) return { error: "That member of staff is not at this school." };
  if (staff.isActive === input.isActive) return { ok: true as const };

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
    if (!check.allowed) return { error: check.reason! };

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

  revalidatePath("/app/staff");
  revalidatePath(`/app/staff/${staff.id}`);
  return { ok: true as const };
}

/**
 * A new first password, for somebody who has forgotten theirs.
 *
 * Shown once to whoever asked for it and stored only as a hash. There is no email
 * out of this product yet, so the office reads it to them — which is exactly how a
 * school of forty people does this anyway.
 */
export async function resetStaffPassword(input: { staffId: string }) {
  const actor = await requireRole(...OFFICE);

  const staff = await db.staff.findFirst({
    where: { id: input.staffId, schoolId: actor.schoolId },
    select: { id: true, userId: true, user: { select: { name: true, email: true } } },
  });
  if (!staff) return { error: "That member of staff is not at this school." };

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

  return { ok: true as const, firstPassword: password };
}

/** Anybody signed in, changing their own password. Not an office function. */
export async function changeMyPassword(input: { current: string; next: string }) {
  const actor = await requireRole(
    "OWNER", "PRINCIPAL", "ADMIN", "ACCOUNTANT", "TEACHER", "LIBRARIAN", "PARENT", "STUDENT",
  );

  const me = await db.user.findUnique({
    where: { id: actor.id },
    select: { id: true, passwordHash: true, name: true },
  });
  if (!me?.passwordHash) return { error: "This account does not sign in with a password." };

  if (!(await bcrypt.compare(input.current, me.passwordHash))) {
    return { error: "That is not your current password." };
  }
  const next = String(input.next ?? "");
  if (next.length < 8) return { error: "A password needs at least 8 characters." };
  if (next === input.current) return { error: "That is the password you already have." };

  await db.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "staff.password.change",
    entity: "User",
    entityId: me.id,
    summary: `${me.name} changed their own password.`,
  });

  return { ok: true as const };
}

/** A completed training, workshop or course, for NEP's CPD hours. */
export async function addCpdRecord(input: {
  staffId: string;
  title: string;
  provider?: string | null;
  hours: number;
  completedOnIso?: string | null;
  certificateUrl?: string | null;
}) {
  const actor = await requireRole(...OFFICE);

  const staff = await db.staff.findFirst({
    where: { id: input.staffId, schoolId: actor.schoolId },
    select: { id: true, user: { select: { name: true } } },
  });
  if (!staff) return { error: "That member of staff is not at this school." };

  const title = input.title.trim();
  if (!title) return { error: "A CPD record needs a title." };

  const hours = Math.round(Number(input.hours));
  if (!Number.isFinite(hours) || hours <= 0) return { error: "Hours must be a positive number." };

  const completedOn = asDate(input.completedOnIso) ?? new Date();

  const record = await db.cpdRecord.create({
    data: {
      schoolId: actor.schoolId,
      staffId: staff.id,
      title,
      provider: input.provider?.trim() || null,
      hours,
      completedOn,
      certificateUrl: input.certificateUrl?.trim() || null,
    },
    select: { id: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "staff.cpd.add",
    entity: "CpdRecord",
    entityId: record.id,
    summary: `Recorded ${hours} CPD hour${hours === 1 ? "" : "s"} for ${staff.user.name}: ${title}`,
  });

  revalidatePath(`/app/staff/${staff.id}`);
  return { ok: true as const };
}
