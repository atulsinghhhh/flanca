import { db } from "@/lib/db";
import { eligibilityCheck, summariseAttendance, absenceStreak } from "@/lib/core/attendance-core";

export function dayStartOf(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Second Saturdays and Sundays are non-teaching days in most Indian schools. */
export function isNonTeachingDay(d: Date): boolean {
  const day = d.getUTCDay();
  if (day === 0) return true;
  return day === 6 && d.getUTCDate() > 7 && d.getUTCDate() <= 14;
}

/**
 * Who has marked and who has not — the screen a principal checks at 10 am.
 * Nothing here is inferred: a section with no rows is shown as "not marked",
 * never as "everyone present".
 *
 * `onlySectionIds`, when given, restricts the whole picture to those sections —
 * a class teacher's own view of the day, not the school's. Office leaves it
 * unset and sees everything, the same as ever.
 */
export async function getMarkingStatus(schoolId: string, date: Date, onlySectionIds?: string[]) {
  const day = dayStartOf(date);

  const [sections, marks, holiday] = await Promise.all([
    db.section.findMany({
      where: { schoolId, ...(onlySectionIds ? { id: { in: onlySectionIds } } : {}) },
      orderBy: [{ class: { sequenceOrder: "asc" } }, { name: "asc" }],
      include: {
        class: { select: { id: true, name: true, sequenceOrder: true } },
        classTeacher: { select: { name: true } },
        _count: { select: { students: { where: { status: "ACTIVE" } } } },
      },
    }),
    db.attendance.groupBy({
      by: ["sectionId", "status"],
      where: { schoolId, date: day, studentId: { not: null } },
      _count: true,
    }),
    db.calendarEvent.findFirst({
      // A single-day holiday has no endDate, so it must match the day EXACTLY —
      // "startDate <= day" alone would make every past holiday look like today's.
      where: {
        schoolId,
        kind: "HOLIDAY",
        OR: [
          { startDate: day, endDate: null },
          { startDate: { lte: day }, endDate: { gte: day } },
        ],
      },
    }),
  ]);

  const bySection = new Map<string, Record<string, number>>();
  for (const row of marks) {
    if (!row.sectionId) continue;
    const acc = bySection.get(row.sectionId) ?? {};
    acc[row.status] = row._count;
    bySection.set(row.sectionId, acc);
  }

  const rows = sections.map((s) => {
    const counts = bySection.get(s.id) ?? {};
    const marked = Object.values(counts).reduce((a, b) => a + b, 0);
    const present = (counts.PRESENT ?? 0) + (counts.LATE ?? 0);
    return {
      sectionId: s.id,
      classId: s.class.id,
      label: `${s.class.name} ${s.name}`,
      sequenceOrder: s.class.sequenceOrder,
      teacherName: s.classTeacher?.name ?? null,
      strength: s._count.students,
      marked,
      present,
      absent: counts.ABSENT ?? 0,
      late: counts.LATE ?? 0,
      leave: counts.LEAVE ?? 0,
      isComplete: marked >= s._count.students && s._count.students > 0,
      percentBp: marked > 0 ? Math.round((present / marked) * 10000) : 0,
    };
  });

  const strength = rows.reduce((a, r) => a + r.strength, 0);
  const marked = rows.reduce((a, r) => a + r.marked, 0);
  const present = rows.reduce((a, r) => a + r.present, 0);

  return {
    date: day,
    rows,
    pending: rows.filter((r) => !r.isComplete && r.strength > 0),
    holiday: holiday?.title ?? null,
    isNonTeachingDay: isNonTeachingDay(day),
    totals: {
      strength,
      marked,
      present,
      absent: rows.reduce((a, r) => a + r.absent, 0),
      late: rows.reduce((a, r) => a + r.late, 0),
      leave: rows.reduce((a, r) => a + r.leave, 0),
      percentBp: marked > 0 ? Math.round((present / marked) * 10000) : 0,
      sectionsComplete: rows.filter((r) => r.isComplete).length,
      sectionCount: rows.filter((r) => r.strength > 0).length,
    },
  };
}

/** The roster a teacher marks, with whatever was already recorded today. */
export async function getSectionSheet(schoolId: string, sectionId: string, date: Date) {
  const day = dayStartOf(date);

  const section = await db.section.findFirst({
    where: { id: sectionId, schoolId },
    include: {
      class: { select: { id: true, name: true } },
      classTeacher: { select: { name: true } },
    },
  });
  if (!section) return null;

  const [students, existing, lock] = await Promise.all([
    db.student.findMany({
      where: { schoolId, sectionId, status: "ACTIVE" },
      orderBy: [{ rollNumber: "asc" }, { name: "asc" }],
      select: { id: true, name: true, rollNumber: true, admissionNumber: true, gender: true },
    }),
    db.attendance.findMany({
      where: { schoolId, sectionId, date: day, studentId: { not: null } },
      select: { studentId: true, status: true, markedAt: true, markedBy: { select: { name: true } } },
    }),
    db.attendanceLock.findUnique({
      where: { schoolId_sectionId_date: { schoolId, sectionId, date: day } },
      select: { lockedAt: true, lockedBy: { select: { name: true } } },
    }),
  ]);

  const byStudent = new Map(existing.map((e) => [e.studentId!, e]));

  // A running absence streak is the signal worth a phone call, and a teacher
  // marking today is exactly the right person to see it.
  const recent = await db.attendance.findMany({
    where: {
      schoolId,
      sectionId,
      studentId: { in: students.map((s) => s.id) },
      date: { gte: new Date(day.getTime() - 21 * 86_400_000), lt: day },
    },
    select: { studentId: true, status: true, date: true },
  });

  const streaks = new Map<string, number>();
  for (const s of students) {
    const rows = recent.filter((r) => r.studentId === s.id);
    streaks.set(s.id, absenceStreak(rows as never));
  }

  return {
    section: {
      id: section.id,
      label: `${section.class.name} ${section.name}`,
      classId: section.class.id,
      classTeacherId: section.classTeacherId,
      teacherName: section.classTeacher?.name ?? null,
    },
    date: day,
    markedBy: existing[0]?.markedBy?.name ?? null,
    markedAt: existing[0]?.markedAt ?? null,
    locked: lock != null,
    lockedBy: lock?.lockedBy?.name ?? null,
    lockedAt: lock?.lockedAt ?? null,
    students: students.map((s) => ({
      ...s,
      status: byStudent.get(s.id)?.status ?? null,
      priorAbsences: streaks.get(s.id) ?? 0,
    })),
  };
}

/** The monthly register: the page a school prints and files. */
export async function getMonthlyRegister(
  schoolId: string,
  sectionId: string,
  year: number,
  month: number,
) {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));

  const section = await db.section.findFirst({
    where: { id: sectionId, schoolId },
    include: { class: { select: { name: true } }, classTeacher: { select: { name: true } } },
  });
  if (!section) return null;

  const [students, rows, holidays] = await Promise.all([
    db.student.findMany({
      where: { schoolId, sectionId, status: "ACTIVE" },
      orderBy: [{ rollNumber: "asc" }, { name: "asc" }],
      select: { id: true, name: true, rollNumber: true },
    }),
    db.attendance.findMany({
      where: { schoolId, sectionId, date: { gte: first, lte: last }, studentId: { not: null } },
      select: { studentId: true, status: true, date: true },
    }),
    db.calendarEvent.findMany({
      where: { schoolId, kind: "HOLIDAY", startDate: { lte: last } },
      select: { title: true, startDate: true, endDate: true },
    }),
  ]);

  const days: Array<{ day: number; date: Date; nonTeaching: boolean; holiday: string | null }> = [];
  for (let d = 1; d <= last.getUTCDate(); d++) {
    const date = new Date(Date.UTC(year, month, d));
    const holiday = holidays.find(
      (h) => date >= dayStartOf(h.startDate) && date <= dayStartOf(h.endDate ?? h.startDate),
    );
    days.push({ day: d, date, nonTeaching: isNonTeachingDay(date), holiday: holiday?.title ?? null });
  }

  const grid = new Map<string, Map<number, string>>();
  for (const r of rows) {
    const inner = grid.get(r.studentId!) ?? new Map<number, string>();
    inner.set(r.date.getUTCDate(), r.status);
    grid.set(r.studentId!, inner);
  }

  return {
    section: {
      label: `${section.class.name} ${section.name}`,
      teacherName: section.classTeacher?.name ?? null,
    },
    year,
    month,
    days,
    students: students.map((s) => {
      const marks = grid.get(s.id) ?? new Map();
      const summary = summariseAttendance(
        [...marks.entries()].map(([d, status]) => ({ date: new Date(Date.UTC(year, month, d)), status })) as never,
      );
      return { ...s, marks, summary };
    }),
  };
}

/**
 * Board-eligibility shortage. The whole point is that this arrives in November
 * with time to act, not in March when nothing can be done.
 */
export async function getShortageReport(schoolId: string, requiredPercent = 75, onlySectionIds?: string[]) {
  const students = await db.student.findMany({
    where: {
      schoolId,
      status: "ACTIVE",
      class: { sequenceOrder: { gte: 3 } },
      ...(onlySectionIds ? { sectionId: { in: onlySectionIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      admissionNumber: true,
      guardianPhone: true,
      class: { select: { name: true, sequenceOrder: true } },
      section: { select: { name: true } },
      attendance: { select: { status: true, date: true } },
    },
  });

  const rows = students
    .map((s) => {
      const summary = summariseAttendance(s.attendance as never);
      const remainingDays = Math.max(0, 200 - summary.workingDays);
      const verdict = eligibilityCheck({
        presentDays: summary.presentDays,
        workingDays: summary.workingDays,
        remainingDays,
        requiredPercent,
      });
      return {
        id: s.id,
        name: s.name,
        admissionNumber: s.admissionNumber,
        phone: s.guardianPhone,
        className: s.class?.name ?? "—",
        sequenceOrder: s.class?.sequenceOrder ?? 99,
        sectionName: s.section?.name ?? "",
        summary,
        verdict,
      };
    })
    .filter((r) => r.summary.workingDays > 0 && r.verdict.isShort)
    .sort((a, b) => a.summary.percentBp - b.summary.percentBp);

  return {
    requiredPercent,
    rows,
    unreachable: rows.filter((r) => r.verdict.unreachable).length,
  };
}

/** Staff attendance for a day, plus who is on approved leave. */
export async function getStaffAttendance(schoolId: string, date: Date) {
  const day = dayStartOf(date);

  const [staff, marks, leaves] = await Promise.all([
    db.staff.findMany({
      where: { schoolId, isActive: true },
      orderBy: { employeeId: "asc" },
      include: { user: { select: { name: true } } },
    }),
    db.attendance.findMany({
      where: { schoolId, date: day, staffId: { not: null } },
      select: { staffId: true, status: true },
    }),
    db.leaveRequest.findMany({
      where: { schoolId, status: "APPROVED", fromDate: { lte: day }, toDate: { gte: day } },
      select: { staffId: true, kind: true },
    }),
  ]);

  const byStaff = new Map(marks.map((m) => [m.staffId!, m.status]));
  const onLeave = new Map(leaves.map((l) => [l.staffId, l.kind]));

  const rows = staff.map((s) => ({
    id: s.id,
    name: s.user.name,
    employeeId: s.employeeId,
    designation: s.designation,
    department: s.department,
    status: byStaff.get(s.id) ?? null,
    approvedLeave: onLeave.get(s.id) ?? null,
  }));

  return {
    date: day,
    rows,
    totals: {
      strength: rows.length,
      present: rows.filter((r) => r.status === "PRESENT" || r.status === "LATE").length,
      absent: rows.filter((r) => r.status === "ABSENT").length,
      leave: rows.filter((r) => r.status === "LEAVE").length,
      unmarked: rows.filter((r) => r.status === null).length,
    },
  };
}
