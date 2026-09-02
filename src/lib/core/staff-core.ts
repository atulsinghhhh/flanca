/**
 * The people who work at the school. Pure.
 *
 * A school could not add a member of staff. Not a teacher, not a clerk, not the
 * principal — the seed created all of them, so a real school's first day had no way
 * to put its own people in, and without staff there is nobody to mark attendance,
 * enter marks, take a fee or answer a parent's message.
 *
 * Two of these rules are load-bearing beyond this file. Roles decide what every
 * screen in the product will let a person do, and a teacher who stops being active
 * takes a section's parents' only line to the school with them — chat-core's
 * canBeClassTeacher refuses a departed teacher precisely so that cannot happen
 * silently, which means deactivating one has to be refused here for the same reason.
 */

export type StaffField =
  | "name" | "email" | "phone" | "employeeId" | "designation"
  | "roles" | "basicPay" | "joiningDate" | "dob";

export type StaffMessage = { field: StaffField; level: "ERROR" | "WARNING"; message: string };
export type StaffCheck = { ok: boolean; messages: StaffMessage[] };
export type StaffGuard = { allowed: boolean; reason: string | null };

/**
 * The roles a school can hand out from the staff screen.
 *
 * STUDENT and PARENT are deliberately absent: those come from being a student or
 * being linked to one, and handing PARENT to a member of staff would give them a
 * parent's view of somebody else's child.
 */
export const ASSIGNABLE_ROLES = ["OWNER", "PRINCIPAL", "ADMIN", "ACCOUNTANT", "TEACHER", "LIBRARIAN"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

const MIN_WORKING_AGE = 18;
const MAX_PLAUSIBLE_MONTHLY_PAISE = 100_000_00; // ₹1 lakh a month

export function isAssignableRole(role: string): role is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

export type StaffDetails = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  employeeId?: string | null;
  designation?: string | null;
  roles?: string[] | null;
  basicPaise?: number | null;
  joiningIso?: string | null;
  dobIso?: string | null;
};

export function validateStaffDetails(d: StaffDetails, today = new Date()): StaffCheck {
  const messages: StaffMessage[] = [];

  const name = (d.name ?? "").trim();
  if (name === "") messages.push({ field: "name", level: "ERROR", message: "The person's name is required." });
  else if (name.length < 2) messages.push({ field: "name", level: "ERROR", message: "That name is too short to be a name." });

  // The email is the login. Not decoration, and not optional: without it this person
  // cannot sign in, and a member of staff who cannot sign in cannot do their job.
  const email = (d.email ?? "").trim().toLowerCase();
  if (email === "") {
    messages.push({ field: "email", level: "ERROR", message: "An email address is needed — it is how this person signs in." });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    messages.push({ field: "email", level: "ERROR", message: "That does not look like an email address." });
  }

  const roles = (d.roles ?? []).filter((r) => r.trim() !== "");
  if (roles.length === 0) {
    messages.push({ field: "roles", level: "ERROR", message: "Choose at least one role — it decides what this person can open." });
  } else {
    const bad = roles.filter((r) => !isAssignableRole(r));
    if (bad.length > 0) {
      messages.push({
        field: "roles",
        level: "ERROR",
        message: `${bad.join(", ")} cannot be given to a member of staff.`,
      });
    }
  }

  const phone = (d.phone ?? "").replace(/\D/g, "");
  if (phone !== "" && phone.length !== 10) {
    messages.push({ field: "phone", level: "ERROR", message: "An Indian mobile number is 10 digits." });
  }

  if (d.basicPaise != null) {
    if (!Number.isInteger(d.basicPaise) || d.basicPaise < 0) {
      messages.push({ field: "basicPay", level: "ERROR", message: "A salary cannot be negative." });
    } else if (d.basicPaise > MAX_PLAUSIBLE_MONTHLY_PAISE) {
      messages.push({
        field: "basicPay",
        level: "WARNING",
        message: "That is over ₹1 lakh a month — check it is the monthly basic and not the annual figure.",
      });
    }
  }

  if (d.joiningIso) {
    const joined = new Date(`${d.joiningIso}T00:00:00Z`);
    if (Number.isNaN(joined.getTime())) {
      messages.push({ field: "joiningDate", level: "ERROR", message: "That joining date is not a date." });
    } else if (joined.getTime() > today.getTime() + 370 * 86_400_000) {
      messages.push({ field: "joiningDate", level: "ERROR", message: "That joining date is more than a year away." });
    } else if (joined.getTime() > today.getTime()) {
      messages.push({ field: "joiningDate", level: "WARNING", message: "This person has not joined yet." });
    }
  }

  if (d.dobIso) {
    const dob = new Date(`${d.dobIso}T00:00:00Z`);
    if (Number.isNaN(dob.getTime())) {
      messages.push({ field: "dob", level: "ERROR", message: "That date of birth is not a date." });
    } else {
      const years = (today.getTime() - dob.getTime()) / (365.25 * 86_400_000);
      if (years < MIN_WORKING_AGE) {
        messages.push({ field: "dob", level: "ERROR", message: `That would make them ${Math.floor(years)} years old.` });
      } else if (years > 75) {
        messages.push({ field: "dob", level: "WARNING", message: "Check the year of birth." });
      }
    }
  }

  return { ok: messages.every((m) => m.level !== "ERROR"), messages };
}

/**
 * The next employee id, continuing whatever the school already uses.
 *
 * The same shape as admission numbers: read the highest number the school has, keep
 * its prefix and its padding, add one. A school that writes NPS-001 keeps getting
 * NPS-004, not a new scheme invented by the software.
 */
export function employeeIdParts(existing: string[]): { prefix: string; width: number; next: number } {
  let prefix = "";
  let width = 3;
  let highest = 0;

  for (const id of existing) {
    const m = /^(.*?)(\d+)$/.exec(id.trim());
    if (!m) continue;
    const n = Number(m[2]);
    if (!Number.isFinite(n)) continue;
    if (n > highest) {
      highest = n;
      prefix = m[1];
      width = m[2].length;
    }
  }
  return { prefix, width, next: highest + 1 };
}

export function nextEmployeeId(existing: string[], fallbackPrefix = "EMP-"): string {
  const { prefix, width, next } = employeeIdParts(existing);
  const p = prefix || fallbackPrefix;
  return `${p}${String(next).padStart(width, "0")}`;
}

/**
 * Whether this person can be marked as having left.
 *
 * Nothing in this product revokes a SchoolRole when Staff.isActive goes false, and
 * a class teacher is the one line a section's parents have to the school. Letting
 * somebody vanish while they still hold a section, or still have periods on the
 * timetable, would leave a register nobody is responsible for and a set of families
 * messaging an empty chair.
 */
export function canDeactivateStaff(counts: {
  classTeacherOfSections: number;
  timetablePeriods: number;
  isLastOwner: boolean;
}): StaffGuard {
  if (counts.isLastOwner) {
    return { allowed: false, reason: "This is the school's only owner. Give somebody else the owner role first." };
  }
  if (counts.classTeacherOfSections > 0) {
    return {
      allowed: false,
      reason: `This person is class teacher of ${counts.classTeacherOfSections} ${
        counts.classTeacherOfSections === 1 ? "section" : "sections"
      }. Hand those over first — the parents in them have no other line to the school.`,
    };
  }
  if (counts.timetablePeriods > 0) {
    return {
      allowed: false,
      reason: `${counts.timetablePeriods} ${
        counts.timetablePeriods === 1 ? "period is" : "periods are"
      } still on the timetable for this person. Reassign those first.`,
    };
  }
  return { allowed: true, reason: null };
}

/**
 * Whether these roles may be taken away.
 *
 * A school locking itself out of its own office is not a hypothetical: remove the
 * last OWNER and nobody can hand the role back.
 */
export function canChangeRoles(params: {
  from: string[];
  to: string[];
  otherOwners: number;
  isSelf: boolean;
}): StaffGuard {
  const losesOwner = params.from.includes("OWNER") && !params.to.includes("OWNER");
  if (losesOwner && params.otherOwners === 0) {
    return { allowed: false, reason: "This is the school's only owner. Make somebody else an owner first." };
  }
  if (params.isSelf && params.from.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r))
      && !params.to.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r))) {
    return { allowed: false, reason: "That would remove your own access to this screen. Ask another owner to do it." };
  }
  return { allowed: true, reason: null };
}
