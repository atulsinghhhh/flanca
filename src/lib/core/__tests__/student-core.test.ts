import { describe, expect, it } from "vitest";
import {
  admissionPrefixFrom,
  digitsOf,
  highestAdmissionSeq,
  validateStudentDetails,
} from "../student-core";

const TODAY = new Date("2026-08-20T00:00:00Z");
const ok = { name: "Aarohi Deshmukh", classId: "cls-11" };

describe("validateStudentDetails — the front desk is held to the importer's standard", () => {
  it("accepts the minimum a clerk actually knows at the counter", () => {
    expect(validateStudentDetails(ok, TODAY)).toEqual({ ok: true, messages: [] });
  });

  it("refuses a child with no name", () => {
    const check = validateStudentDetails({ ...ok, name: "  " }, TODAY);
    expect(check.ok).toBe(false);
    expect(check.messages[0].message).toMatch(/name is required/);
  });

  it("refuses a child with no class, because everything downstream needs one", () => {
    const check = validateStudentDetails({ ...ok, classId: null }, TODAY);
    expect(check.ok).toBe(false);
    expect(check.messages[0].field).toBe("classId");
  });

  it("refuses a date of birth in the future", () => {
    const check = validateStudentDetails({ ...ok, dobIso: "2027-01-01" }, TODAY);
    expect(check.ok).toBe(false);
    expect(check.messages[0].message).toMatch(/cannot be in the future/);
  });

  it("questions a suspicious birth year without blocking the admission", () => {
    const check = validateStudentDetails({ ...ok, dobIso: "1961-04-02" }, TODAY);
    expect(check.ok).toBe(true);
    expect(check.messages[0].level).toBe("WARNING");
    expect(check.messages[0].message).toMatch(/check the year/);
  });

  it("warns about a short mobile but still admits the child", () => {
    const check = validateStudentDetails({ ...ok, guardianPhone: "98765" }, TODAY);
    expect(check.ok).toBe(true);
    expect(check.messages[0].message).toMatch(/not reachable in the app|not 10 digits/);
  });

  it("accepts a +91 mobile, because that is how a parent writes it", () => {
    expect(validateStudentDetails({ ...ok, guardianPhone: "+91 98765 43210" }, TODAY).messages).toHaveLength(0);
  });

  it("refuses a roll number that is not a roll number", () => {
    expect(validateStudentDetails({ ...ok, rollNumber: 0 }, TODAY).ok).toBe(false);
    expect(validateStudentDetails({ ...ok, rollNumber: 4.5 }, TODAY).ok).toBe(false);
    expect(validateStudentDetails({ ...ok, rollNumber: 42 }, TODAY).ok).toBe(true);
  });

  it("refuses a gender it cannot record", () => {
    expect(validateStudentDetails({ ...ok, gender: "MALE" }, TODAY).ok).toBe(true);
    expect(validateStudentDetails({ ...ok, gender: "yes" }, TODAY).ok).toBe(false);
  });

  it("notices an incomplete email without blocking", () => {
    const check = validateStudentDetails({ ...ok, guardianEmail: "rohit@" }, TODAY);
    expect(check.ok).toBe(true);
    expect(check.messages[0].field).toBe("guardianEmail");
  });
});

describe("digitsOf — a mobile as the phone company sees it", () => {
  it("strips +91, spaces and dashes", () => {
    expect(digitsOf("+91 98765-43210")).toBe("9876543210");
    expect(digitsOf("098765 43210")).toBe("9876543210");
  });

  it("leaves a short number short rather than inventing digits", () => {
    expect(digitsOf("98765")).toBe("98765");
    expect(digitsOf(null)).toBe("");
  });
});

describe("admissionPrefixFrom — adopt the school's habit, do not impose ours", () => {
  it("reads the prefix off a number already on the roll", () => {
    expect(admissionPrefixFrom({ sample: "NPS/1848" })).toBe("NPS/");
    expect(admissionPrefixFrom({ sample: "2026-014" })).toBe("2026-");
    expect(admissionPrefixFrom({ sample: "NPS/26-27/0032" })).toBe("NPS/26-27/");
  });

  it("returns nothing for a school that numbers bare", () => {
    expect(admissionPrefixFrom({ sample: "1043" })).toBe("");
  });

  it("falls back to the school's initials on an empty roll", () => {
    expect(admissionPrefixFrom({ schoolName: "Nalanda Public School" })).toBe("NPS/");
    expect(admissionPrefixFrom({ schoolName: "St. Xavier's High School, Indore" })).toBe("SXHS/");
  });

  it("still produces something usable with no name at all", () => {
    expect(admissionPrefixFrom({})).toBe("ADM/");
  });
});

describe("highestAdmissionSeq — never hand a child a number that is already taken", () => {
  it("compares numerically, not as text", () => {
    // The bug this replaces: a lexicographic max picks "NPS/999" over "NPS/1848".
    expect(highestAdmissionSeq(["NPS/999", "NPS/1848", "NPS/1001"])).toBe(1848);
  });

  it("ignores anything that does not end in a number", () => {
    expect(highestAdmissionSeq(["NPS/ABC", null, undefined, "NPS/12"])).toBe(12);
  });

  it("starts at zero for an empty roll", () => {
    expect(highestAdmissionSeq([])).toBe(0);
  });
});

describe("a child with no section", () => {
  const ok = { name: "Anaya Deshpande", classId: "c1" };

  it("warns, but does not refuse, when the class has sections and none was chosen", () => {
    const check = validateStudentDetails({ ...ok, classHasSections: true });
    expect(check.ok).toBe(true);
    const warn = check.messages.find((m) => m.field === "sectionId");
    expect(warn?.level).toBe("WARNING");
    expect(warn?.message).toMatch(/attendance register/);
  });

  it("says nothing when a section was chosen", () => {
    const check = validateStudentDetails({ ...ok, classHasSections: true, sectionId: "s1" });
    expect(check.messages.find((m) => m.field === "sectionId")).toBeUndefined();
  });

  it("says nothing when the class has no sections to choose from", () => {
    const check = validateStudentDetails({ ...ok, classHasSections: false });
    expect(check.messages.find((m) => m.field === "sectionId")).toBeUndefined();
  });
});
