import { describe, expect, it } from "vitest";
import {
  CBSE_8_POINT,
  computeReport,
  consolidateHpc,
  formatPercent,
  gradeFor,
  percentBp,
  rankStudents,
  weightedFinalBp,
} from "../grading-core";

describe("percentages in basis points", () => {
  it("does not drift", () => {
    expect(percentBp(47, 50)).toBe(9400);
    expect(percentBp(1, 3)).toBe(3333);
    expect(percentBp(0, 0)).toBe(0);
    expect(formatPercent(9400)).toBe("94.00%");
  });
});

describe("CBSE grade bands", () => {
  it("puts boundary marks in the right band", () => {
    expect(gradeFor(9100)!.grade).toBe("A1");
    expect(gradeFor(9000)!.grade).toBe("A2");
    expect(gradeFor(3300)!.grade).toBe("D");
    expect(gradeFor(3200)!.grade).toBe("E");
    expect(gradeFor(10000)!.grade).toBe("A1");
    expect(gradeFor(0)!.grade).toBe("E");
  });

  it("covers the whole 0–100 range with no gap, including fractions", () => {
    // Published bands are integer ranges, so 90.7% sits between A2 (…–90) and
    // A1 (91–…). A real report card must never print a blank grade.
    for (let bp = 0; bp <= 10000; bp += 7) {
      expect(gradeFor(bp, CBSE_8_POINT), `no band for ${bp / 100}%`).not.toBeNull();
    }
    expect(gradeFor(9070)!.grade).toBe("A2");
    expect(gradeFor(9099)!.grade).toBe("A2");
    expect(gradeFor(9100)!.grade).toBe("A1");
    expect(gradeFor(3299)!.grade).toBe("E");
  });
});

describe("computeReport", () => {
  it("totals, grades and passes a normal card", () => {
    const r = computeReport([
      { subject: "English", maxMarks: 100, marks: 82 },
      { subject: "Maths", maxMarks: 100, marks: 95 },
      { subject: "Science", maxMarks: 100, marks: 71 },
    ]);
    expect(r.totalMarks).toBe(248);
    expect(r.maxMarks).toBe(300);
    expect(r.percentBp).toBe(8267);
    expect(r.grade).toBe("A2");
    expect(r.result).toBe("PASS");
  });

  it("fails a subject below 33% and names it", () => {
    const r = computeReport([
      { subject: "English", maxMarks: 100, marks: 82 },
      { subject: "Maths", maxMarks: 100, marks: 20 },
    ]);
    expect(r.result).toBe("FAIL");
    expect(r.failedSubjects).toEqual(["Maths"]);
    expect(r.subjectsPassed).toBe(1);
  });

  it("counts an absent student as zero, not as missing", () => {
    const r = computeReport([
      { subject: "English", maxMarks: 100, marks: null, isAbsent: true },
      { subject: "Maths", maxMarks: 100, marks: 60 },
    ]);
    expect(r.maxMarks).toBe(200);
    expect(r.totalMarks).toBe(60);
    expect(r.failedSubjects).toContain("English");
  });

  it("refuses to declare a result while marks are still missing", () => {
    const r = computeReport([
      { subject: "English", maxMarks: 100, marks: 82 },
      { subject: "Maths", maxMarks: 100, marks: null },
    ]);
    expect(r.result).toBe("PENDING");
    expect(r.pending).toEqual(["Maths"]);
  });

  it("honours a custom pass mark", () => {
    const r = computeReport([{ subject: "Practical", maxMarks: 50, marks: 20, passMarks: 25 }]);
    expect(r.failedSubjects).toEqual(["Practical"]);
  });
});

describe("rankStudents", () => {
  it("gives tied students the same rank and skips the next", () => {
    const ranked = rankStudents([
      { id: "a", percentBp: 9500 },
      { id: "b", percentBp: 9500 },
      { id: "c", percentBp: 9000 },
      { id: "d", percentBp: 8000 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 3],
      ["d", 4],
    ]);
  });
});

describe("weightedFinalBp", () => {
  it("weights terms by their contribution", () => {
    expect(weightedFinalBp([
      { percentBp: 8000, weightage: 30 },
      { percentBp: 9000, weightage: 70 },
    ])).toBe(8700);
  });

  it("returns zero with no weights rather than dividing by zero", () => {
    expect(weightedFinalBp([{ percentBp: 8000, weightage: 0 }])).toBe(0);
  });
});

describe("HPC consolidation (multi-rater, as PARAKH asks)", () => {
  it("averages raters into one level per competency and lists who rated", () => {
    const out = consolidateHpc([
      { domain: "COGNITIVE", competency: "Reasoning", rater: "TEACHER", level: "PROFICIENT" },
      { domain: "COGNITIVE", competency: "Reasoning", rater: "SELF", level: "PROGRESSING" },
      { domain: "PHYSICAL", competency: "Coordination", rater: "TEACHER", level: "ADVANCED" },
    ]);
    const reasoning = out.find((o) => o.competency === "Reasoning")!;
    expect(reasoning.level).toBe("PROFICIENT"); // mean of 1 and 2 → 1.5 → rounds to 2
    expect(reasoning.raters.sort()).toEqual(["SELF", "TEACHER"]);
    expect(out.find((o) => o.competency === "Coordination")!.level).toBe("ADVANCED");
  });

  it("ignores an unknown level rather than crashing the card", () => {
    const out = consolidateHpc([
      { domain: "COGNITIVE", competency: "Reasoning", rater: "TEACHER", level: "NONSENSE" },
    ]);
    expect(out).toHaveLength(0);
  });
});
