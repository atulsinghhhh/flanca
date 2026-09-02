import { describe, expect, it } from "vitest";
import {
  canDeleteExamCycle,
  canDeleteExamPaper,
  canPublishCycle,
  suggestPaperDates,
  tidyCycleName,
  validateExamCycle,
  validateExamPaper,
} from "../exam-core";

describe("validateExamCycle", () => {
  it("accepts a cycle a school would actually set", () => {
    const check = validateExamCycle({ name: "Unit Test 2", startIso: "2026-09-07", endIso: "2026-09-12" });
    expect(check.ok).toBe(true);
    expect(check.messages).toEqual([]);
  });

  it("refuses an empty name and a duplicate, however typed", () => {
    expect(validateExamCycle({ name: "  " }).ok).toBe(false);
    expect(validateExamCycle({ name: "half yearly", existingNames: ["Half Yearly"] }).ok).toBe(false);
  });

  it("refuses a cycle that ends before it starts", () => {
    const check = validateExamCycle({ name: "T", startIso: "2026-09-12", endIso: "2026-09-07" });
    expect(check.messages[0].message).toMatch(/ends before it starts/);
  });

  it("warns about a two-month exam cycle without refusing it", () => {
    const check = validateExamCycle({ name: "T", startIso: "2026-04-01", endIso: "2026-07-01" });
    expect(check.ok).toBe(true);
    expect(check.messages[0].level).toBe("WARNING");
  });

  it("refuses a weightage that is not a percentage", () => {
    expect(validateExamCycle({ name: "T", weightage: 120 }).ok).toBe(false);
    expect(validateExamCycle({ name: "T", weightage: -1 }).ok).toBe(false);
  });

  it("warns when the year's weightages would not add to 100, because the final average depends on it", () => {
    const over = validateExamCycle({ name: "T", weightage: 40, otherWeightages: [40, 40] });
    expect(over.ok).toBe(true);
    expect(over.messages[0].message).toMatch(/add up to 120%/);

    const under = validateExamCycle({ name: "T", weightage: 10, otherWeightages: [40] });
    expect(under.messages[0].message).toMatch(/only 50%/);
    expect(under.messages[0].message).toMatch(/remaining 50%/);
  });

  it("says nothing when they add to exactly 100", () => {
    expect(validateExamCycle({ name: "T", weightage: 20, otherWeightages: [30, 50] }).messages).toEqual([]);
  });
});

describe("tidyCycleName", () => {
  it("collapses the spacing a clerk types", () => {
    expect(tidyCycleName("  Unit   Test 1 ")).toBe("Unit Test 1");
  });
});

describe("validateExamPaper", () => {
  it("accepts an ordinary 80 + 20 CBSE paper", () => {
    const check = validateExamPaper({ maxMarks: 100, passMarks: 33, theoryMax: 80, internalMax: 20 });
    expect(check.ok).toBe(true);
  });

  it("refuses a paper out of nothing", () => {
    expect(validateExamPaper({ maxMarks: 0 }).ok).toBe(false);
    expect(validateExamPaper({ maxMarks: null }).ok).toBe(false);
  });

  it("refuses a pass mark nobody could reach", () => {
    const check = validateExamPaper({ maxMarks: 50, passMarks: 60 });
    expect(check.messages[0].message).toMatch(/Nobody could pass/);
  });

  it("refuses a split that does not add up, which would let a child score over 100%", () => {
    const check = validateExamPaper({ maxMarks: 100, theoryMax: 80, internalMax: 30 });
    expect(check.ok).toBe(false);
    expect(check.messages[0].message).toBe("80 written plus 30 internal is 110, not 100.");
  });

  it("allows a split given on its own, since the other half may come later", () => {
    expect(validateExamPaper({ maxMarks: 100, theoryMax: 80 }).ok).toBe(true);
  });

  it("warns about a paper sat outside its own cycle", () => {
    const check = validateExamPaper({
      maxMarks: 100,
      examDateIso: "2026-10-01",
      cycleStartIso: "2026-09-07",
      cycleEndIso: "2026-09-12",
    });
    expect(check.ok).toBe(true);
    expect(check.messages[0].field).toBe("examDate");
  });

  it("warns about a suspiciously large total", () => {
    expect(validateExamPaper({ maxMarks: 600 }).messages[0].level).toBe("WARNING");
  });
});

describe("suggestPaperDates — a datesheet nobody has to correct", () => {
  it("gives one paper a day from the start date", () => {
    expect(suggestPaperDates("2026-09-07", 3)).toEqual(["2026-09-07", "2026-09-08", "2026-09-09"]);
  });

  it("never puts a paper on a Sunday", () => {
    // 2026-09-11 is a Friday; the run has to skip Sunday the 13th.
    const dates = suggestPaperDates("2026-09-11", 3);
    expect(dates).toEqual(["2026-09-11", "2026-09-12", "2026-09-14"]);
    expect(dates.every((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0)).toBe(true);
  });

  it("can sit two papers in a day", () => {
    expect(suggestPaperDates("2026-09-07", 4, 2)).toEqual([
      "2026-09-07", "2026-09-07", "2026-09-08", "2026-09-08",
    ]);
  });

  it("refuses nonsense rather than returning something wrong", () => {
    expect(suggestPaperDates("not-a-date", 3)).toEqual([]);
    expect(suggestPaperDates("2026-09-07", 0)).toEqual([]);
    expect(suggestPaperDates("2026-09-07", 99)).toEqual([]);
  });
});

describe("canDeleteExamCycle / canDeleteExamPaper", () => {
  it("allows removing a cycle nothing has been marked against", () => {
    expect(canDeleteExamCycle({ results: 0, reportCards: 0 }).allowed).toBe(true);
  });

  it("refuses once marks exist, in numbers a school recognises", () => {
    expect(canDeleteExamCycle({ results: 5334, reportCards: 0 }).reason).toMatch(/5,334 marks have/);
    expect(canDeleteExamCycle({ results: 1, reportCards: 0 }).reason).toMatch(/1 mark has/);
  });

  it("refuses once report cards refer to it", () => {
    expect(canDeleteExamCycle({ results: 0, reportCards: 782 }).reason).toMatch(/782 report cards refer/);
  });

  it("refuses removing a paper with marks on it", () => {
    expect(canDeleteExamPaper({ results: 40 }).reason).toMatch(/40 marks have/);
    expect(canDeleteExamPaper({ results: 0 }).allowed).toBe(true);
  });
});

describe("canPublishCycle", () => {
  it("refuses a cycle with no papers", () => {
    expect(canPublishCycle({ expected: 0, entered: 0 }).reason).toMatch(/no papers/);
  });

  it("refuses while any mark is missing, and counts them", () => {
    expect(canPublishCycle({ expected: 100, entered: 99 }).reason).toMatch(/1 mark is still/);
    expect(canPublishCycle({ expected: 100, entered: 60 }).reason).toMatch(/40 marks are still/);
  });

  it("allows a complete cycle", () => {
    expect(canPublishCycle({ expected: 100, entered: 100 }).allowed).toBe(true);
  });
});
