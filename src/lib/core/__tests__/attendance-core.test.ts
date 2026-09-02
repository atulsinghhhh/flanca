import { describe, expect, it } from "vitest";
import {
  absenceStreak,
  attendanceClientKey,
  eligibilityCheck,
  summariseAttendance,
} from "../attendance-core";

const d = (s: string) => new Date(s);

describe("summariseAttendance", () => {
  it("excludes holidays from working days", () => {
    const s = summariseAttendance([
      { date: d("2026-08-10"), status: "PRESENT" },
      { date: d("2026-08-11"), status: "ABSENT" },
      { date: d("2026-08-12"), status: "HOLIDAY" },
      { date: d("2026-08-13"), status: "PRESENT" },
    ]);
    expect(s.workingDays).toBe(3);
    expect(s.presentDays).toBe(2);
    expect(s.percentBp).toBe(6667);
  });

  it("counts a half day as half and a late as present", () => {
    const s = summariseAttendance([
      { date: d("2026-08-10"), status: "HALF_DAY" },
      { date: d("2026-08-11"), status: "LATE" },
    ]);
    expect(s.presentDays).toBe(1.5);
    expect(s.lateDays).toBe(1);
    expect(s.percentBp).toBe(7500);
  });

  it("does not credit sanctioned leave as attendance", () => {
    const s = summariseAttendance([
      { date: d("2026-08-10"), status: "LEAVE" },
      { date: d("2026-08-11"), status: "PRESENT" },
    ]);
    expect(s.presentDays).toBe(1);
    expect(s.leaveDays).toBe(1);
    expect(s.percentBp).toBe(5000);
  });

  it("returns zero, not NaN, for an empty register", () => {
    expect(summariseAttendance([]).percentBp).toBe(0);
  });
});

describe("eligibilityCheck — a child admitted this morning is not failing", () => {
  it("does not call a brand-new student short when no day has been marked", () => {
    const v = eligibilityCheck({ presentDays: 0, workingDays: 0, remainingDays: 200 });
    expect(v.isShort).toBe(false);
    expect(v.percentBp).toBe(0);
  });

  it("still calls a real shortage a shortage", () => {
    const v = eligibilityCheck({ presentDays: 40, workingDays: 100, remainingDays: 100 });
    expect(v.isShort).toBe(true);
  });
});

describe("eligibilityCheck — the 75% board rule", () => {
  it("says how many days are still needed", () => {
    const v = eligibilityCheck({ presentDays: 60, workingDays: 100, remainingDays: 100 });
    expect(v.percentBp).toBe(6000);
    expect(v.isShort).toBe(true);
    expect(v.daysNeeded).toBe(90); // 75% of 200 = 150; 150 − 60
    expect(v.unreachable).toBe(false);
  });

  it("flags an arithmetically unreachable requirement", () => {
    const v = eligibilityCheck({ presentDays: 30, workingDays: 100, remainingDays: 10 });
    expect(v.unreachable).toBe(true);
  });

  it("tells a comfortable student how many days they can still miss", () => {
    const v = eligibilityCheck({ presentDays: 100, workingDays: 100, remainingDays: 100 });
    expect(v.isShort).toBe(false);
    expect(v.daysAffordable).toBe(50);
  });

  it("respects a custom requirement", () => {
    const v = eligibilityCheck({ presentDays: 80, workingDays: 100, remainingDays: 0, requiredPercent: 85 });
    expect(v.isShort).toBe(true);
  });
});

describe("absenceStreak", () => {
  it("counts consecutive absences ending on the latest day", () => {
    expect(
      absenceStreak([
        { date: d("2026-08-17"), status: "PRESENT" },
        { date: d("2026-08-18"), status: "ABSENT" },
        { date: d("2026-08-19"), status: "ABSENT" },
      ]),
    ).toBe(2);
  });

  it("is zero when the student came today", () => {
    expect(
      absenceStreak([
        { date: d("2026-08-18"), status: "ABSENT" },
        { date: d("2026-08-19"), status: "PRESENT" },
      ]),
    ).toBe(0);
  });

  it("looks through holidays without breaking the streak count", () => {
    expect(
      absenceStreak([
        { date: d("2026-08-17"), status: "ABSENT" },
        { date: d("2026-08-18"), status: "HOLIDAY" },
        { date: d("2026-08-19"), status: "ABSENT" },
      ]),
    ).toBe(2);
  });
});

describe("offline sync keys", () => {
  it("is stable for the same student, date and period", () => {
    const a = attendanceClientKey({ studentId: "s1", date: d("2026-08-19"), period: 0 });
    const b = attendanceClientKey({ studentId: "s1", date: d("2026-08-19"), period: 0 });
    expect(a).toBe(b);
    expect(a).toBe("att:s1:2026-08-19:0");
  });

  it("differs by period so a period-wise mark is not lost", () => {
    expect(attendanceClientKey({ studentId: "s1", date: d("2026-08-19"), period: 1 })).not.toBe(
      attendanceClientKey({ studentId: "s1", date: d("2026-08-19"), period: 2 }),
    );
  });
});
