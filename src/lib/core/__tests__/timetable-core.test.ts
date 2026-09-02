import { describe, expect, it } from "vitest";
import { buildTimetable, canPlacePeriod, countClashes, teacherLoad, weekOfSlots } from "../timetable-core";

const section = (id: string, subjects: [string, string | null][]) => ({
  sectionId: id,
  subjects: subjects.map(([subjectId, staffId]) => ({ subjectId, staffId })),
});

describe("buildTimetable — nobody is in two rooms at once", () => {
  it("fills a single section's week", () => {
    const slots = weekOfSlots(["A"]);
    const t = buildTimetable({
      slots,
      sections: [section("A", [["maths", "t1"], ["science", "t2"], ["english", "t3"], ["hindi", "t4"]])],
    });
    expect(t.entries).toHaveLength(slots.length);
    expect(t.unfilled).toEqual([]);
    expect(t.clashes).toBe(0);
  });

  it("never double-books a teacher across sections that share one", () => {
    // The exact case that broke the demo: one teacher per subject, the same subjects
    // in several sections, every section wanting period 1 on Monday.
    const shared: [string, string | null][] = [
      ["maths", "t1"], ["science", "t2"], ["english", "t3"], ["hindi", "t4"],
      ["social", "t5"], ["sanskrit", "t6"], ["computer", "t7"], ["art", "t8"],
    ];
    const ids = ["A", "B", "C", "D", "E", "F"];
    const t = buildTimetable({
      slots: weekOfSlots(ids),
      sections: ids.map((id) => section(id, shared)),
    });
    expect(t.clashes).toBe(0);
    expect(countClashes(t.entries)).toBe(0);
  });

  it("leaves a slot empty rather than putting somebody in two places", () => {
    // Two sections, one subject, one teacher: half the periods cannot be filled.
    const t = buildTimetable({
      slots: weekOfSlots(["A", "B"], () => 2, [1]),
      sections: [section("A", [["maths", "t1"]]), section("B", [["maths", "t1"]])],
    });
    expect(t.entries).toHaveLength(2);
    expect(t.unfilled).toHaveLength(2);
    expect(t.clashes).toBe(0);
  });

  it("spreads the week instead of front-loading one subject", () => {
    const t = buildTimetable({
      slots: weekOfSlots(["A"], () => 4, [1, 2]),
      sections: [section("A", [["maths", "t1"], ["science", "t2"], ["english", "t3"], ["hindi", "t4"]])],
    });
    const counts = new Map<string, number>();
    for (const e of t.entries) counts.set(e.subjectId, (counts.get(e.subjectId) ?? 0) + 1);
    expect([...counts.values()]).toEqual([2, 2, 2, 2]);
  });

  it("keeps a subject to twice a day while it can", () => {
    const t = buildTimetable({
      slots: weekOfSlots(["A"], () => 6, [1]),
      sections: [section("A", [["maths", "t1"], ["science", "t2"], ["english", "t3"]])],
    });
    const monday = t.entries.filter((e) => e.dayOfWeek === 1);
    const perSubject = new Map<string, number>();
    for (const e of monday) perSubject.set(e.subjectId, (perSubject.get(e.subjectId) ?? 0) + 1);
    expect(Math.max(...perSubject.values())).toBe(2);
  });

  it("relaxes twice-a-day rather than leaving a period free with a teacher available", () => {
    // One subject, one section, six periods: the preference has to give way.
    const t = buildTimetable({
      slots: weekOfSlots(["A"], () => 6, [1]),
      sections: [section("A", [["maths", "t1"]])],
    });
    expect(t.entries).toHaveLength(6);
    expect(t.unfilled).toEqual([]);
  });

  it("handles a subject with no teacher assigned without clashing on null", () => {
    const t = buildTimetable({
      slots: weekOfSlots(["A", "B"], () => 2, [1]),
      sections: [section("A", [["library", null]]), section("B", [["library", null]])],
    });
    expect(t.entries).toHaveLength(4);
    expect(t.clashes).toBe(0);
  });

  it("gives a section with no subjects nothing, rather than throwing", () => {
    const t = buildTimetable({ slots: weekOfSlots(["A"], () => 2, [1]), sections: [section("A", [])] });
    expect(t.entries).toEqual([]);
    expect(t.unfilled).toHaveLength(2);
  });

  it("is deterministic — the same school twice gives the same timetable", () => {
    const build = () =>
      buildTimetable({
        slots: weekOfSlots(["A", "B", "C"]),
        sections: ["A", "B", "C"].map((id) => section(id, [["maths", "t1"], ["science", "t2"], ["english", "t3"]])),
      });
    expect(JSON.stringify(build().entries)).toBe(JSON.stringify(build().entries));
  });
});

describe("weekOfSlots", () => {
  it("is six days, eight periods, four on Saturday", () => {
    const slots = weekOfSlots(["A"]);
    expect(slots).toHaveLength(5 * 8 + 4);
    expect(slots.filter((s) => s.dayOfWeek === 6)).toHaveLength(4);
  });

  it("covers every section in every period", () => {
    expect(weekOfSlots(["A", "B"], () => 2, [1])).toHaveLength(4);
  });
});

describe("a teacher's week has a ceiling", () => {
  it("does not put one teacher in all 44 periods when others could take them", () => {
    // Exactly what happened to the demo school: one teacher per subject, and greedy
    // filling handed a single teacher the entire week.
    const t = buildTimetable({
      slots: weekOfSlots(["A"]),
      sections: [section("A", [["maths", "t1"], ["science", "t2"], ["english", "t3"], ["hindi", "t4"]])],
    });
    expect(t.busiestTeacherPeriods).toBeLessThanOrEqual(30);
    expect(t.entries).toHaveLength(44);
  });

  it("gives way rather than leaving periods empty when there is only one teacher", () => {
    const t = buildTimetable({
      slots: weekOfSlots(["A"]),
      sections: [section("A", [["maths", "t1"]])],
      maxPeriodsPerTeacher: 10,
    });
    expect(t.entries).toHaveLength(44);
    expect(t.busiestTeacherPeriods).toBe(44);
  });

  it("respects a cap a school sets for itself", () => {
    const t = buildTimetable({
      slots: weekOfSlots(["A"], () => 4, [1, 2, 3]),
      sections: [section("A", [["maths", "t1"], ["science", "t2"], ["english", "t3"]])],
      maxPeriodsPerTeacher: 4,
    });
    expect(t.busiestTeacherPeriods).toBeLessThanOrEqual(4);
  });
});

describe("canPlacePeriod — editing one cell", () => {
  it("allows a free teacher", () => {
    expect(
      canPlacePeriod({ staffId: "t1", dayOfWeek: 1, period: 3, elsewhere: [{ staffId: "t2", sectionName: "7B" }] }).allowed,
    ).toBe(true);
  });

  it("refuses a clash and says where they already are, which is the useful part", () => {
    const check = canPlacePeriod({
      staffId: "t1",
      dayOfWeek: 1,
      period: 3,
      elsewhere: [{ staffId: "t1", sectionName: "7B" }],
    });
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe("They are already taking 7B in period 3 that day.");
  });

  it("allows a period with nobody assigned", () => {
    expect(canPlacePeriod({ staffId: null, dayOfWeek: 1, period: 3, elsewhere: [] }).allowed).toBe(true);
  });
});

describe("teacherLoad", () => {
  it("counts a week per teacher and ignores unassigned periods", () => {
    const load = teacherLoad([{ staffId: "t1" }, { staffId: "t1" }, { staffId: "t2" }, { staffId: null }]);
    expect(load.get("t1")).toBe(2);
    expect(load.get("t2")).toBe(1);
    expect(load.size).toBe(2);
  });
});
