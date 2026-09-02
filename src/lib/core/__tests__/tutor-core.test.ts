import { describe, expect, it } from "vitest";
import {
  cohortHeadline,
  coveragePercent,
  hasActivity,
  masteryDisplay,
  mistakeLine,
  onlyThese,
  rosterFor,
  tutorClassLevelOf,
  type TutorChild,
} from "../tutor-core";

const student = (over: Partial<Parameters<typeof rosterFor>[0]["students"][number]> = {}) => ({
  admissionNumber: "1001",
  name: "Kabir Bhatia",
  className: "Class 7",
  section: "A",
  status: "ACTIVE",
  ...over,
});

describe("rosterFor — who is sent, and who is taken off", () => {
  it("sends every active child in the scope", () => {
    const intent = rosterFor({
      students: [student(), student({ admissionNumber: "1002", name: "Zoya Khan" })],
      known: new Set(),
    });
    expect(intent.counts).toEqual({ send: 2, withdraw: 0, ignored: 0 });
    expect(intent.lines.every((l) => l.withdrawn === undefined)).toBe(true);
  });

  it("NEVER sends an email, because the tutor keys identity on it and siblings share a parent's", () => {
    const intent = rosterFor({ students: [student()], known: new Set() });
    expect(intent.lines[0]).not.toHaveProperty("email");
    expect(Object.values(intent.lines[0])).not.toContain("parent@example.com");
  });

  it("withdraws a child who has left — but only one the tutor actually holds", () => {
    const intent = rosterFor({
      students: [
        student({ admissionNumber: "1001", status: "TRANSFERRED" }),
        student({ admissionNumber: "1002", status: "ALUMNI" }),
      ],
      known: new Set(["1001"]),
    });
    expect(intent.counts).toEqual({ send: 0, withdraw: 1, ignored: 1 });
    expect(intent.lines).toHaveLength(1);
    expect(intent.lines[0]).toMatchObject({ admissionNumber: "1001", withdrawn: true });
    expect(intent.ignored).toEqual(["1002"]);
  });

  it("says nothing at all about a leaver the tutor never had — no line, no withdrawal", () => {
    const intent = rosterFor({ students: [student({ status: "DROPPED" })], known: new Set() });
    expect(intent.lines).toHaveLength(0);
  });

  it("carries a leaver-for-joiner swap in one push, which is how a school does it", () => {
    const intent = rosterFor({
      students: [
        student({ admissionNumber: "1001", status: "TRANSFERRED" }),
        student({ admissionNumber: "1400", name: "New Child" }),
      ],
      known: new Set(["1001"]),
    });
    expect(intent.counts).toEqual({ send: 1, withdraw: 1, ignored: 0 });
  });

  it("drops a repeated admission number rather than sending it twice", () => {
    const intent = rosterFor({
      students: [student(), student({ name: "Someone Else" })],
      known: new Set(),
    });
    expect(intent.lines).toHaveLength(1);
    expect(intent.lines[0].name).toBe("Kabir Bhatia");
  });

  it("ignores a blank admission number instead of sending a child nothing identifies", () => {
    const intent = rosterFor({ students: [student({ admissionNumber: "  " })], known: new Set() });
    expect(intent.lines).toHaveLength(0);
  });

  it("a scope of one class produces no line about any other class — absence never withdraws", () => {
    // Class 7 pushed on its own; the tutor also holds Class 8's 2001.
    const intent = rosterFor({ students: [student()], known: new Set(["1001", "2001"]) });
    expect(intent.lines.map((l) => l.admissionNumber)).toEqual(["1001"]);
    expect(intent.counts.withdraw).toBe(0);
  });
});

/* ─────────────────────────── the return half ─────────────────────────── */

const child = (over: Partial<TutorChild> = {}): TutorChild => ({
  admissionNumber: "1001",
  name: "Kabir Bhatia",
  classLevel: "7",
  coverage: 0.13,
  mastery: null,
  caveat: "Rests on 6 of 46 topics.",
  repeatedMistakes: [],
  chaptersStarted: 2,
  lastActive: "2026-08-20",
  ...over,
});

describe("onlyThese — a class teacher sees her section, not the class", () => {
  it("keeps the tutor's order rather than re-sorting", () => {
    const rows = [
      child({ admissionNumber: "1003", coverage: 0.02 }),
      child({ admissionNumber: "1001", coverage: 0.4 }),
      child({ admissionNumber: "1002", coverage: 0.9 }),
    ];
    const kept = onlyThese(rows, new Set(["1001", "1002"]));
    expect(kept.map((c) => c.admissionNumber)).toEqual(["1001", "1002"]);
  });

  it("drops a child with no admission number rather than guessing whose they are", () => {
    expect(onlyThese([child({ admissionNumber: null })], new Set(["1001"]))).toHaveLength(0);
  });
});

describe("cohortHeadline — the two things that are true in week one", () => {
  it("counts who has not started, and who has a repeating mistake", () => {
    const rows = [
      child({ chaptersStarted: 0, coverage: 0 }),
      child({ chaptersStarted: 4, coverage: 0.2, repeatedMistakes: [{ topic: "Integers", mistakeType: "sign_error", occurrences: 4 }] }),
      child({ chaptersStarted: 1, coverage: 0.03 }),
    ];
    expect(cohortHeadline(rows)).toEqual({ total: 3, notStarted: 1, started: 2, withPatterns: 1 });
  });
});

describe("masteryDisplay — a withheld number stays withheld", () => {
  it("shows the caveat INSTEAD of a figure, never underneath one", () => {
    const shown = masteryDisplay(child({ mastery: null, caveat: "Rests on 6 of 46 topics." }));
    expect(shown.value).toBeNull();
    expect(shown.note).toBe("Rests on 6 of 46 topics.");
  });

  it("says something honest even when the tutor sent no caveat", () => {
    expect(masteryDisplay(child({ mastery: null, caveat: null })).note).toMatch(/not enough/i);
  });

  it("shows the figure when the tutor was willing to stand behind it", () => {
    expect(masteryDisplay(child({ mastery: 0.624, caveat: null }))).toEqual({ value: "62%", note: null });
  });
});

describe("small honesties", () => {
  it("rounds coverage and refuses to exceed the whole syllabus", () => {
    expect(coveragePercent(0.134)).toBe(13);
    expect(coveragePercent(1.4)).toBe(100);
    expect(coveragePercent(-1)).toBe(0);
  });

  it("writes a mistake as a sentence a teacher can read at a glance", () => {
    expect(mistakeLine({ topic: "Integers", mistakeType: "sign_error", occurrences: 4 })).toBe("sign error in Integers, 4 times");
  });

  it("knows the difference between a quiet account and a bad one", () => {
    expect(hasActivity(child({ chaptersStarted: 0, coverage: 0, repeatedMistakes: [] }))).toBe(false);
    expect(hasActivity(child({ chaptersStarted: 0, coverage: 0, repeatedMistakes: [{ topic: "x", mistakeType: "y", occurrences: 3 }] }))).toBe(true);
  });
});

describe("tutorClassLevelOf — the tutor teaches Class 3 to 12 and no other", () => {
  it("agrees with the importer about what a school meant", () => {
    for (const written of ["Class 7", "7", "VII", "7th", "7 B", "7B", "std 7"]) {
      expect(tutorClassLevelOf(written)).toBe("7");
    }
  });

  it("says no to a class the tutor cannot teach, rather than showing an empty panel", () => {
    for (const written of ["Nursery", "LKG", "UKG", "Class 1", "Class 2", "", null, "Pre-KG"]) {
      expect(tutorClassLevelOf(written)).toBeNull();
    }
  });
});
