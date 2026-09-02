import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ROLES,
  canChangeRoles,
  canDeactivateStaff,
  employeeIdParts,
  isAssignableRole,
  nextEmployeeId,
  validateStaffDetails,
} from "../staff-core";

const TODAY = new Date("2026-08-20T00:00:00Z");
const ok = { name: "Priya Menon", email: "priya@school.edu.in", roles: ["TEACHER"] };

describe("which roles a school may hand out", () => {
  it("offers the six staff roles", () => {
    expect([...ASSIGNABLE_ROLES]).toEqual(["OWNER", "PRINCIPAL", "ADMIN", "ACCOUNTANT", "TEACHER", "LIBRARIAN"]);
  });

  it("never offers STUDENT or PARENT — a parent role would show somebody else's child", () => {
    expect(isAssignableRole("PARENT")).toBe(false);
    expect(isAssignableRole("STUDENT")).toBe(false);
  });
});

describe("validateStaffDetails", () => {
  it("accepts a teacher with a name, an email and a role", () => {
    expect(validateStaffDetails(ok, TODAY).ok).toBe(true);
  });

  it("insists on an email, because it is how the person signs in", () => {
    const check = validateStaffDetails({ ...ok, email: "" }, TODAY);
    expect(check.ok).toBe(false);
    expect(check.messages[0].message).toMatch(/how this person signs in/);
  });

  it("refuses something that is not an email", () => {
    expect(validateStaffDetails({ ...ok, email: "priya.school" }, TODAY).ok).toBe(false);
  });

  it("insists on at least one role", () => {
    const check = validateStaffDetails({ ...ok, roles: [] }, TODAY);
    expect(check.messages.find((m) => m.field === "roles")?.message).toMatch(/what this person can open/);
  });

  it("refuses a role a school cannot hand out", () => {
    expect(validateStaffDetails({ ...ok, roles: ["TEACHER", "PARENT"] }, TODAY).ok).toBe(false);
  });

  it("wants ten digits or nothing for a phone", () => {
    expect(validateStaffDetails({ ...ok, phone: "98260 10001" }, TODAY).ok).toBe(true);
    expect(validateStaffDetails({ ...ok, phone: "982601" }, TODAY).ok).toBe(false);
    expect(validateStaffDetails({ ...ok, phone: "" }, TODAY).ok).toBe(true);
  });

  it("warns when the basic pay looks like an annual figure", () => {
    const check = validateStaffDetails({ ...ok, basicPaise: 480_000_00 }, TODAY);
    expect(check.ok).toBe(true);
    expect(check.messages.find((m) => m.field === "basicPay")?.level).toBe("WARNING");
  });

  it("refuses a negative salary", () => {
    expect(validateStaffDetails({ ...ok, basicPaise: -1 }, TODAY).ok).toBe(false);
  });

  it("allows a future joining date but says so", () => {
    const check = validateStaffDetails({ ...ok, joiningIso: "2026-09-01" }, TODAY);
    expect(check.ok).toBe(true);
    expect(check.messages.find((m) => m.field === "joiningDate")?.message).toMatch(/not joined yet/);
  });

  it("refuses a joining date more than a year away", () => {
    expect(validateStaffDetails({ ...ok, joiningIso: "2030-01-01" }, TODAY).ok).toBe(false);
  });

  it("refuses a child as a member of staff", () => {
    const check = validateStaffDetails({ ...ok, dobIso: "2014-01-01" }, TODAY);
    expect(check.ok).toBe(false);
    expect(check.messages.find((m) => m.field === "dob")?.message).toMatch(/12 years old/);
  });
});

describe("nextEmployeeId — continue the school's own numbering", () => {
  it("keeps the prefix and the padding a school already uses", () => {
    expect(nextEmployeeId(["NPS-001", "NPS-002", "NPS-003"])).toBe("NPS-004");
  });

  it("counts numerically, not alphabetically", () => {
    expect(nextEmployeeId(["NPS-009", "NPS-010"])).toBe("NPS-011");
    expect(nextEmployeeId(["EMP-2", "EMP-10"])).toBe("EMP-11");
  });

  it("keeps four digits when the school uses four", () => {
    expect(nextEmployeeId(["STF-0042"])).toBe("STF-0043");
  });

  it("starts somewhere sensible for a school with nobody yet", () => {
    expect(nextEmployeeId([])).toBe("EMP-001");
  });

  it("ignores ids with no number in them rather than throwing", () => {
    expect(employeeIdParts(["principal", "NPS-007"])).toEqual({ prefix: "NPS-", width: 3, next: 8 });
  });
});

describe("canDeactivateStaff — somebody leaving must not orphan a section", () => {
  const clean = { classTeacherOfSections: 0, timetablePeriods: 0, isLastOwner: false };

  it("allows an ordinary leaver", () => {
    expect(canDeactivateStaff(clean).allowed).toBe(true);
  });

  it("refuses while they hold a section, because those parents have no other line in", () => {
    const check = canDeactivateStaff({ ...clean, classTeacherOfSections: 2 });
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/2 sections/);
    expect(check.reason).toMatch(/no other line to the school/);
  });

  it("refuses while periods are still theirs", () => {
    expect(canDeactivateStaff({ ...clean, timetablePeriods: 24 }).reason).toMatch(/24 periods are/);
  });

  it("refuses the school's only owner", () => {
    expect(canDeactivateStaff({ ...clean, isLastOwner: true }).reason).toMatch(/only owner/);
  });
});

describe("canChangeRoles — a school must not lock itself out", () => {
  it("allows an ordinary change", () => {
    expect(canChangeRoles({ from: ["TEACHER"], to: ["TEACHER", "LIBRARIAN"], otherOwners: 1, isSelf: false }).allowed).toBe(true);
  });

  it("refuses removing the last owner", () => {
    const check = canChangeRoles({ from: ["OWNER"], to: ["TEACHER"], otherOwners: 0, isSelf: false });
    expect(check.reason).toMatch(/only owner/);
  });

  it("allows removing an owner when another one exists", () => {
    expect(canChangeRoles({ from: ["OWNER"], to: ["TEACHER"], otherOwners: 1, isSelf: false }).allowed).toBe(true);
  });

  it("refuses somebody removing their own way back in", () => {
    const check = canChangeRoles({ from: ["ADMIN"], to: ["TEACHER"], otherOwners: 2, isSelf: true });
    expect(check.reason).toMatch(/your own access/);
  });
});
