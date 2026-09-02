import { describe, expect, it } from "vitest";
import { setupProgress, setupSteps, type SetupState } from "../onboarding-core";

const empty: SetupState = {
  hasSchoolDetails: false, hasCurrentYear: false, classes: 0, sections: 0, subjects: 0,
  subjectsWithTeacher: 0, teachers: 0, sectionsWithClassTeacher: 0, students: 0, feeHeads: 0,
  classesPriced: 0, terms: 0, invoicesRaised: 0, timetabledSections: 0, examCycles: 0,
};

// The seeded demo school, which is a school that has finished setting up.
const finished: SetupState = {
  hasSchoolDetails: true, hasCurrentYear: true, classes: 13, sections: 23, subjects: 113,
  subjectsWithTeacher: 113, teachers: 42, sectionsWithClassTeacher: 23, students: 857, feeHeads: 7,
  classesPriced: 13, terms: 4, invoicesRaised: 1714, timetabledSections: 23, examCycles: 2,
};

describe("setupSteps — a school's first hour", () => {
  it("shows nothing done for a brand-new school", () => {
    expect(setupSteps(empty).every((s) => !s.done)).toBe(true);
  });

  it("shows everything done for the finished school", () => {
    expect(setupSteps(finished).every((s) => s.done)).toBe(true);
  });

  it("does not tell a school to price fees before it has classes", () => {
    const steps = setupSteps({ ...empty, hasCurrentYear: true, feeHeads: 0 });
    expect(steps.find((s) => s.key === "feeAmounts")?.blockedBy).toBe("fee heads to price");
  });

  it("blocks terms on a priced class, because that is where the schema hangs them", () => {
    const withFees = setupSteps({ ...empty, feeHeads: 5, classes: 3, classesPriced: 0 });
    expect(withFees.find((s) => s.key === "terms")?.blockedBy).toBe("a priced class to attach them to");

    const priced = setupSteps({ ...empty, feeHeads: 5, classes: 3, classesPriced: 3 });
    expect(priced.find((s) => s.key === "terms")?.blockedBy).toBeNull();
  });

  it("blocks raising invoices on whichever is actually missing", () => {
    const noTerms = setupSteps({ ...empty, students: 100, terms: 0 });
    expect(noTerms.find((s) => s.key === "invoices")?.blockedBy).toBe("terms");

    const noKids = setupSteps({ ...empty, students: 0, terms: 4 });
    expect(noKids.find((s) => s.key === "invoices")?.blockedBy).toBe("children on the roll");
  });

  it("counts class teachers against sections rather than declaring victory at one", () => {
    const half = setupSteps({ ...empty, teachers: 5, sections: 10, sectionsWithClassTeacher: 5 });
    const step = half.find((s) => s.key === "classTeachers")!;
    expect(step.done).toBe(false);
    expect(step.detail).toBe("5 of 10 sections have one");
  });

  it("treats the timetable and exams as things a school can open without", () => {
    const steps = setupSteps(empty);
    expect(steps.filter((s) => s.optional).map((s) => s.key)).toEqual(["timetable", "exams"]);
  });

  it("says what there is, not just whether it is done", () => {
    const steps = setupSteps(finished);
    expect(steps.find((s) => s.key === "students")?.detail).toBe("857 children");
    expect(steps.find((s) => s.key === "invoices")?.detail).toBe("1,714 invoices raised");
  });
});

describe("setupProgress", () => {
  it("counts only what a school cannot open without", () => {
    const p = setupProgress(setupSteps(finished));
    expect(p.done).toBe(p.total);
    expect(p.total).toBe(11);
    expect(p.percentBp).toBe(10000);
  });

  it("is nothing at the start", () => {
    expect(setupProgress(setupSteps(empty)).percentBp).toBe(0);
  });

  it("points at the first thing that is not waiting on something else", () => {
    // Nothing done: school details and the year are both unblocked, and details come
    // first in the list.
    expect(setupProgress(setupSteps(empty)).nextUp?.key).toBe("school");
  });

  it("skips a step that is blocked when choosing what to do next", () => {
    const s = { ...empty, hasSchoolDetails: true, hasCurrentYear: true };
    // Classes are unblocked now (the year is set), so that is next — not the roll,
    // which is waiting for classes.
    expect(setupProgress(setupSteps(s)).nextUp?.key).toBe("classes");
  });

  it("has nothing to suggest once everything is done", () => {
    expect(setupProgress(setupSteps(finished)).nextUp).toBeNull();
  });
});
