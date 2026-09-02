/**
 * Attendance maths. Pure.
 *
 * Boards require a minimum attendance to sit an exam (commonly 75%). A school
 * that discovers a shortage in March has a crisis; one that sees it in November
 * has a conversation. So shortage projection is a first-class output, not a report.
 */

export type AttendanceRow = {
  date: Date;
  status: "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "LEAVE" | "HOLIDAY";
};

export const PRESENT_WEIGHT: Record<string, number> = {
  PRESENT: 1,
  LATE: 1,
  HALF_DAY: 0.5,
  LEAVE: 0, // sanctioned, but still not present
  ABSENT: 0,
  HOLIDAY: 0,
};

export type AttendanceSummary = {
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number;
  percentBp: number; // basis points
};

export function summariseAttendance(rows: AttendanceRow[]): AttendanceSummary {
  const counted = rows.filter((r) => r.status !== "HOLIDAY");
  const present = counted.reduce((a, r) => a + (PRESENT_WEIGHT[r.status] ?? 0), 0);

  return {
    workingDays: counted.length,
    presentDays: present,
    absentDays: counted.filter((r) => r.status === "ABSENT").length,
    lateDays: counted.filter((r) => r.status === "LATE").length,
    leaveDays: counted.filter((r) => r.status === "LEAVE").length,
    percentBp: counted.length === 0 ? 0 : Math.round((present / counted.length) * 10000),
  };
}

export type ShortageVerdict = {
  percentBp: number;
  requiredBp: number;
  isShort: boolean;
  /** days that must be attended from here to reach the requirement */
  daysNeeded: number;
  /** days that can still be missed while staying eligible */
  daysAffordable: number;
  /** true when the requirement is arithmetically out of reach */
  unreachable: boolean;
};

export function eligibilityCheck(params: {
  presentDays: number;
  workingDays: number;
  remainingDays: number;
  requiredPercent?: number;
}): ShortageVerdict {
  const required = params.requiredPercent ?? 75;
  const requiredBp = required * 100;
  const { presentDays, workingDays, remainingDays } = params;

  const totalDays = workingDays + remainingDays;
  const percentBp = workingDays === 0 ? 0 : Math.round((presentDays / workingDays) * 10000);

  // present + x >= (required/100) * total  →  x >= required*total/100 - present
  const needed = Math.max(0, Math.ceil((required * totalDays) / 100 - presentDays));
  const maxMissable = Math.floor(totalDays - (required * totalDays) / 100);
  const alreadyMissed = workingDays - presentDays;

  return {
    percentBp,
    requiredBp,
    // Nothing to be short of yet. A child admitted this morning has 0 of 0 working
    // days, and flagging them as failing the board's 75% rule is a false alarm the
    // office has to explain to a parent.
    isShort: workingDays > 0 && percentBp < requiredBp,
    daysNeeded: needed,
    daysAffordable: Math.max(0, Math.floor(maxMissable - alreadyMissed)),
    unreachable: needed > remainingDays,
  };
}

/** Consecutive-absence streak ending today — the signal worth a phone call. */
export function absenceStreak(rows: AttendanceRow[]): number {
  const sorted = [...rows]
    .filter((r) => r.status !== "HOLIDAY")
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  let streak = 0;
  for (const row of sorted) {
    if (row.status === "ABSENT") streak++;
    else break;
  }
  return streak;
}

/**
 * Offline sync: the teacher's device generates a clientKey per mark so a replay
 * after reconnecting can never double-write or lose an entry.
 */
export function attendanceClientKey(params: {
  studentId: string;
  date: Date;
  period: number;
}): string {
  const d = params.date;
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `att:${params.studentId}:${iso}:${params.period}`;
}
