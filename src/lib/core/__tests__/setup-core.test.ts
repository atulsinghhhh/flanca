import { describe, expect, it } from "vitest";
import {
  canBeClassTeacher,
  canDeleteFeeHead,
  canDeleteSubject,
  canDeleteClass,
  canDeleteSection,
  classOrderFor,
  tidyClassName,
  tidySectionName,
  validateClassName,
  validateSectionName,
  validateFeeAmount,
  validateFeeHeadName,
  validateSubjectName,
} from "../setup-core";

describe("tidyClassName — what a school means when it types a class", () => {
  it("turns a bare number into a class", () => {
    expect(tidyClassName("8")).toBe("Class 8");
    expect(tidyClassName(" 11 ")).toBe("Class 11");
  });

  it("keeps the pre-primary names schools actually use", () => {
    expect(tidyClassName("nursery")).toBe("Nursery");
    expect(tidyClassName("lkg")).toBe("LKG");
    expect(tidyClassName("UKG")).toBe("UKG");
  });

  it("collapses the many ways of writing the same class", () => {
    expect(tidyClassName("class 8")).toBe("Class 8");
    expect(tidyClassName("Class  8")).toBe("Class 8");
    expect(tidyClassName("CLASS 8")).toBe("Class 8");
  });
});

describe("classOrderFor — Nursery to Class 12, not alphabetical", () => {
  it("puts pre-primary before Class 1", () => {
    expect(classOrderFor("Play Group")).toBeLessThan(classOrderFor("Nursery"));
    expect(classOrderFor("Nursery")).toBeLessThan(classOrderFor("LKG"));
    expect(classOrderFor("UKG")).toBeLessThan(classOrderFor("Class 1"));
  });

  it("puts Class 2 before Class 10, which alphabetical sorting does not", () => {
    expect(classOrderFor("Class 2")).toBeLessThan(classOrderFor("Class 10"));
  });

  it("matches the order the seeded school already uses", () => {
    // Nursery 0, LKG 1, UKG 2, Class 1 → 3 … Class 11 → 13
    expect(classOrderFor("Nursery")).toBe(0);
    expect(classOrderFor("Class 1")).toBe(3);
    expect(classOrderFor("Class 11")).toBe(13);
  });

  it("parks something unrecognised at the end rather than at the front", () => {
    expect(classOrderFor("Remedial")).toBe(99);
  });
});

describe("tidySectionName", () => {
  it("upper-cases a letter", () => {
    expect(tidySectionName("a")).toBe("A");
    expect(tidySectionName(" b ")).toBe("B");
  });

  it("drops the word a clerk types in front of it", () => {
    expect(tidySectionName("Section C")).toBe("C");
    expect(tidySectionName("sec-d")).toBe("D");
  });

  it("leaves a real name alone", () => {
    expect(tidySectionName("Rose House")).toBe("Rose House");
  });
});

describe("validateClassName / validateSectionName", () => {
  it("refuses an empty name", () => {
    expect(validateClassName("  ").allowed).toBe(false);
    expect(validateSectionName("").allowed).toBe(false);
  });

  it("refuses a duplicate however it was typed", () => {
    const check = validateClassName("class 8", ["Class 8"]);
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/already exists/);
  });

  it("accepts a genuinely new class", () => {
    expect(validateClassName("12", ["Class 8"]).allowed).toBe(true);
  });

  it("refuses a duplicate section within the class", () => {
    expect(validateSectionName("a", ["A", "B"]).allowed).toBe(false);
    expect(validateSectionName("c", ["A", "B"]).allowed).toBe(true);
  });
});

describe("canDeleteSection — tidying up must not orphan a record", () => {
  it("allows removing an empty, unused section", () => {
    expect(canDeleteSection({ students: 0, attendance: 0, timetable: 0 })).toEqual({ allowed: true, reason: null });
  });

  it("refuses while children are in it, and says so in numbers", () => {
    const check = canDeleteSection({ students: 3, attendance: 0, timetable: 0 });
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/3 children are in this section/);
  });

  it("uses the singular for one child", () => {
    expect(canDeleteSection({ students: 1, attendance: 0, timetable: 0 }).reason).toMatch(/1 child is/);
  });

  it("refuses when attendance exists, so the register stays readable", () => {
    expect(canDeleteSection({ students: 0, attendance: 40, timetable: 0 }).reason).toMatch(/register/);
  });

  it("refuses while the timetable still points at it", () => {
    expect(canDeleteSection({ students: 0, attendance: 0, timetable: 6 }).reason).toMatch(/timetable/);
  });
});

describe("canDeleteClass", () => {
  it("allows an empty class with nothing attached", () => {
    expect(canDeleteClass({ students: 0, sections: 0, subjects: 0 }).allowed).toBe(true);
  });

  it("refuses while children, sections or subjects remain", () => {
    expect(canDeleteClass({ students: 2, sections: 0, subjects: 0 }).allowed).toBe(false);
    expect(canDeleteClass({ students: 0, sections: 1, subjects: 0 }).reason).toMatch(/sections/);
    expect(canDeleteClass({ students: 0, sections: 0, subjects: 4 }).reason).toMatch(/Subjects/);
  });
});

describe("canBeClassTeacher — chat's only line to a family runs through this field", () => {
  it("allows an active teacher", () => {
    expect(canBeClassTeacher({ isActiveStaff: true, roles: ["TEACHER"] }).allowed).toBe(true);
  });

  it("allows the office, which often holds a class in a small school", () => {
    expect(canBeClassTeacher({ isActiveStaff: true, roles: ["PRINCIPAL"] }).allowed).toBe(true);
  });

  it("refuses somebody who has left, because every parent in that section would lose their line to the school", () => {
    const check = canBeClassTeacher({ isActiveStaff: false, roles: ["TEACHER"] });
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/left the school/);
  });

  it("refuses a librarian or an accountant", () => {
    expect(canBeClassTeacher({ isActiveStaff: true, roles: ["LIBRARIAN"] }).allowed).toBe(false);
    expect(canBeClassTeacher({ isActiveStaff: true, roles: ["ACCOUNTANT"] }).allowed).toBe(false);
  });
});

describe("validateSubjectName / canDeleteSubject", () => {
  it("refuses an empty name and a duplicate within the class", () => {
    expect(validateSubjectName("").allowed).toBe(false);
    expect(validateSubjectName("mathematics", ["Mathematics"]).allowed).toBe(false);
    expect(validateSubjectName("Sanskrit", ["Mathematics"]).allowed).toBe(true);
  });

  it("allows removing a subject nothing academic points at", () => {
    expect(canDeleteSubject({ exams: 0, timetable: 0, homework: 0, lessonPlans: 0 }).allowed).toBe(true);
  });

  it("refuses once exam papers exist, because marks and report cards refer to them", () => {
    const check = canDeleteSubject({ exams: 2, timetable: 0, homework: 0, lessonPlans: 0 });
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/2 exam papers/);
  });

  it("uses the singular for one paper", () => {
    expect(canDeleteSubject({ exams: 1, timetable: 0, homework: 0, lessonPlans: 0 }).reason).toMatch(/1 exam paper /);
  });

  it("refuses while the timetable, homework or a lesson plan points at it", () => {
    expect(canDeleteSubject({ exams: 0, timetable: 4, homework: 0, lessonPlans: 0 }).reason).toMatch(/timetable/);
    expect(canDeleteSubject({ exams: 0, timetable: 0, homework: 3, lessonPlans: 0 }).reason).toMatch(/Homework/);
    expect(canDeleteSubject({ exams: 0, timetable: 0, homework: 0, lessonPlans: 1 }).reason).toMatch(/Lesson plans/);
  });
});

describe("fee heads and amounts", () => {
  it("refuses an empty or duplicate head", () => {
    expect(validateFeeHeadName("").allowed).toBe(false);
    expect(validateFeeHeadName("tuition fee", ["Tuition Fee"]).allowed).toBe(false);
    expect(validateFeeHeadName("Lab Fee", ["Tuition Fee"]).allowed).toBe(true);
  });

  it("refuses to remove a head some class still charges, in numbers", () => {
    expect(canDeleteFeeHead({ items: 0 }).allowed).toBe(true);
    expect(canDeleteFeeHead({ items: 1 }).reason).toMatch(/1 class charges/);
    expect(canDeleteFeeHead({ items: 13 }).reason).toMatch(/13 classes charge/);
  });

  it("accepts a normal fee and zero", () => {
    expect(validateFeeAmount(0).allowed).toBe(true);
    expect(validateFeeAmount(1370000).allowed).toBe(true);
  });

  it("refuses a negative fee and points at concessions instead", () => {
    expect(validateFeeAmount(-100).reason).toMatch(/concession/);
  });

  it("catches a misplaced zero before it reaches a parent", () => {
    expect(validateFeeAmount(500_000_00).allowed).toBe(true);      // ₹5 lakh — a real annual fee
    expect(validateFeeAmount(5_000_001_00).allowed).toBe(false);   // ₹50 lakh+ — check the zeroes
  });

  it("refuses something that is not an amount at all", () => {
    expect(validateFeeAmount(null).allowed).toBe(false);
    expect(validateFeeAmount(12.5).allowed).toBe(false);
  });
});
