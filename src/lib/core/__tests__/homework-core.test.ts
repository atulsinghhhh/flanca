import { describe, expect, it } from "vitest";
import {
  canCloseHomework,
  canDeleteHomework,
  canPublishHomework,
  canSetHomework,
  canSubmitHomework,
  defaultDueDate,
  validateHomework,
  validateMarks,
  validateSubmission,
} from "../homework-core";

const TODAY = "2026-08-20"; // a Thursday

describe("validateHomework", () => {
  it("accepts the ordinary case", () => {
    const check = validateHomework({ title: "Exercise 4B, sums 1–10", dueIso: "2026-08-21", todayIso: TODAY });
    expect(check.ok).toBe(true);
    expect(check.messages).toEqual([]);
  });

  it("insists on a title", () => {
    expect(validateHomework({ title: "  ", todayIso: TODAY }).ok).toBe(false);
  });

  it("refuses homework due before it is set", () => {
    const check = validateHomework({ title: "T", assignedIso: "2026-08-20", dueIso: "2026-08-19", todayIso: TODAY });
    expect(check.messages[0].message).toMatch(/due before it is set/);
  });

  it("catches a Sunday due date without refusing it", () => {
    // 2026-08-23 is a Sunday.
    const check = validateHomework({ title: "T", dueIso: "2026-08-23", todayIso: TODAY });
    expect(check.ok).toBe(true);
    expect(check.messages[0].message).toMatch(/Sunday/);
  });

  it("refuses homework set more than a month ahead", () => {
    expect(validateHomework({ title: "T", assignedIso: "2026-10-20", todayIso: TODAY }).ok).toBe(false);
  });

  it("warns about a due date three months out", () => {
    const check = validateHomework({ title: "T", dueIso: "2026-12-25", todayIso: TODAY });
    expect(check.ok).toBe(true);
    expect(check.messages[0].level).toBe("WARNING");
  });
});

describe("canSetHomework — the same reach rule chat uses", () => {
  const base = { classTeacherOfSectionIds: ["s1"], teachesSectionIds: ["s2"], sectionId: "s1", isActiveStaff: true };

  it("lets a principal set it for a section they stand in front of, same as a teacher", () => {
    expect(canSetHomework({ ...base, roles: ["PRINCIPAL"], sectionId: "s1" }).allowed).toBe(true);
  });

  it("refuses a principal a section they do not teach — office is not exempt", () => {
    const check = canSetHomework({ ...base, roles: ["PRINCIPAL"], sectionId: "s9" });
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/do not teach that section/);
  });

  it("lets a teacher set it for a section they are class teacher of", () => {
    expect(canSetHomework({ ...base, roles: ["TEACHER"] }).allowed).toBe(true);
  });

  it("lets a teacher set it for a section they have a period with", () => {
    expect(canSetHomework({ ...base, roles: ["TEACHER"], sectionId: "s2" }).allowed).toBe(true);
  });

  it("refuses a section they do not stand in front of", () => {
    const check = canSetHomework({ ...base, roles: ["TEACHER"], sectionId: "s3" });
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/do not teach that section/);
  });

  it("refuses a teacher who has left", () => {
    expect(canSetHomework({ ...base, roles: ["TEACHER"], isActiveStaff: false }).allowed).toBe(false);
  });

  it("refuses a librarian", () => {
    expect(canSetHomework({ ...base, roles: ["LIBRARIAN"] }).allowed).toBe(false);
  });

  it("asks for a section rather than guessing", () => {
    expect(canSetHomework({ ...base, roles: ["TEACHER"], sectionId: null }).reason).toMatch(/Choose the section/);
  });
});

describe("canDeleteHomework", () => {
  it("allows removing homework nobody has handed in", () => {
    expect(canDeleteHomework({ submissions: 0 }).allowed).toBe(true);
  });

  it("refuses once work is in, because a child's submission is theirs", () => {
    expect(canDeleteHomework({ submissions: 1 }).reason).toMatch(/1 child has/);
    expect(canDeleteHomework({ submissions: 22 }).reason).toMatch(/22 children have/);
  });
});

describe("defaultDueDate", () => {
  it("is tomorrow", () => {
    expect(defaultDueDate("2026-08-20")).toBe("2026-08-21");
  });

  it("skips Sunday to Monday", () => {
    // Saturday the 22nd → tomorrow is Sunday, so Monday the 24th.
    expect(defaultDueDate("2026-08-22")).toBe("2026-08-24");
  });
});

describe("validateHomework — maxMarks", () => {
  it("accepts no maxMarks at all", () => {
    expect(validateHomework({ title: "T", todayIso: TODAY }).ok).toBe(true);
  });

  it("refuses zero or a fraction", () => {
    expect(validateHomework({ title: "T", todayIso: TODAY, maxMarks: 0 }).ok).toBe(false);
    expect(validateHomework({ title: "T", todayIso: TODAY, maxMarks: 4.5 }).ok).toBe(false);
  });

  it("refuses an implausible total", () => {
    expect(validateHomework({ title: "T", todayIso: TODAY, maxMarks: 5000 }).ok).toBe(false);
  });

  it("accepts an ordinary total", () => {
    expect(validateHomework({ title: "T", todayIso: TODAY, maxMarks: 20 }).ok).toBe(true);
  });
});

describe("canPublishHomework — DRAFT → ASSIGNED", () => {
  it("allows publishing a draft", () => {
    expect(canPublishHomework({ status: "DRAFT" }).allowed).toBe(true);
  });

  it("refuses one already assigned", () => {
    expect(canPublishHomework({ status: "ASSIGNED" }).reason).toMatch(/already set/);
  });

  it("refuses one already closed", () => {
    expect(canPublishHomework({ status: "CLOSED" }).reason).toMatch(/already closed/);
  });
});

describe("canCloseHomework — ASSIGNED → CLOSED", () => {
  it("allows closing something assigned", () => {
    expect(canCloseHomework({ status: "ASSIGNED" }).allowed).toBe(true);
  });

  it("refuses a draft — nothing to close", () => {
    expect(canCloseHomework({ status: "DRAFT" }).reason).toMatch(/has not been set/);
  });

  it("refuses one already closed", () => {
    expect(canCloseHomework({ status: "CLOSED" }).reason).toMatch(/already closed/);
  });
});

describe("canSubmitHomework", () => {
  const base = {
    status: "ASSIGNED" as const,
    studentSectionId: "sec1",
    homeworkSectionId: "sec1",
    homeworkClassId: "cls1",
    studentClassId: "cls1",
    alreadySubmitted: false,
  };

  it("allows the ordinary case", () => {
    expect(canSubmitHomework(base).allowed).toBe(true);
  });

  it("refuses a draft — it was never shown to them", () => {
    expect(canSubmitHomework({ ...base, status: "DRAFT" }).reason).toMatch(/not been set/);
  });

  it("refuses a closed homework", () => {
    expect(canSubmitHomework({ ...base, status: "CLOSED" }).reason).toMatch(/closed/);
  });

  it("refuses a second submission", () => {
    expect(canSubmitHomework({ ...base, alreadySubmitted: true }).reason).toMatch(/already handed this in/);
  });

  it("refuses a student in a different section when one was named", () => {
    expect(canSubmitHomework({ ...base, studentSectionId: "sec2" }).reason).toMatch(/not set for your section/);
  });

  it("falls back to the class when the homework has no section", () => {
    expect(canSubmitHomework({ ...base, homeworkSectionId: null, studentSectionId: "sec2" }).allowed).toBe(true);
    expect(canSubmitHomework({ ...base, homeworkSectionId: null, studentClassId: "cls2" }).reason).toMatch(/not set for your class/);
  });
});

describe("validateSubmission", () => {
  it("refuses a blank submission", () => {
    expect(validateSubmission({}).reason).toMatch(/Write something or attach/);
  });

  it("accepts a note alone", () => {
    expect(validateSubmission({ note: "Done, pages 4-6" }).allowed).toBe(true);
  });

  it("accepts a photo alone", () => {
    expect(validateSubmission({ fileUrl: "https://example.com/a.jpg" }).allowed).toBe(true);
  });

  it("refuses an essay-length note", () => {
    expect(validateSubmission({ note: "x".repeat(4001) }).allowed).toBe(false);
  });
});

describe("validateMarks", () => {
  it("allows clearing a mark", () => {
    expect(validateMarks({ marks: null, maxMarks: 20 }).allowed).toBe(true);
  });

  it("refuses a fraction", () => {
    expect(validateMarks({ marks: 7.5, maxMarks: 20 }).reason).toMatch(/whole number/);
  });

  it("refuses a negative mark", () => {
    expect(validateMarks({ marks: -1, maxMarks: 20 }).reason).toMatch(/cannot be negative/);
  });

  it("refuses more than the homework was out of", () => {
    expect(validateMarks({ marks: 25, maxMarks: 20 }).reason).toMatch(/more than the 20/);
  });

  it("allows any non-negative mark when nothing was set to score against", () => {
    expect(validateMarks({ marks: 500, maxMarks: null }).allowed).toBe(true);
  });
});
