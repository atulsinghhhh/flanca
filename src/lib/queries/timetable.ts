import { db } from "@/lib/db";

/**
 * A section's full week grid — the same data src/app/app/timetable/page.tsx
 * shows for a section (as opposed to a teacher's own week): every entry with
 * subject/staff names attached, for the mobile app to lay out as a day×period
 * table.
 */
export async function getSectionTimetable(schoolId: string, sectionId: string) {
  const section = await db.section.findFirst({
    where: { id: sectionId, schoolId },
    include: { class: { select: { name: true } }, classTeacher: { select: { name: true } } },
  });
  if (!section) return null;

  const entries = await db.timetableEntry.findMany({
    where: { schoolId, sectionId },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
    include: {
      subject: { select: { name: true } },
      staff: { include: { user: { select: { name: true } } } },
    },
  });

  return {
    section: {
      id: section.id,
      name: section.name,
      className: section.class.name,
      classTeacher: section.classTeacher?.name ?? null,
    },
    entries: entries.map((e) => ({
      dayOfWeek: e.dayOfWeek,
      period: e.period,
      startTime: e.startTime,
      endTime: e.endTime,
      roomNo: e.roomNo,
      subjectId: e.subjectId,
      subjectName: e.subject?.name ?? null,
      staffId: e.staffId,
      staffName: e.staff?.user.name ?? null,
    })),
  };
}

/**
 * Every section in the school for one day of the week, as a single flat
 * roster — the office's "whole school, one page" master chart rather than
 * one section at a time. Sections come back ordered the way a printed
 * timetable would list them (class sequence, then section name), each
 * carrying only that one day's periods so the caller can lay them out as
 * columns without re-grouping.
 */
export async function getSchoolTimetableForDay(schoolId: string, dayOfWeek: number) {
  const sections = await db.section.findMany({
    where: { schoolId },
    orderBy: [{ class: { sequenceOrder: "asc" } }, { name: "asc" }],
    include: { class: { select: { name: true } } },
  });

  const entries = await db.timetableEntry.findMany({
    where: { schoolId, dayOfWeek },
    include: {
      subject: { select: { name: true } },
      staff: { include: { user: { select: { name: true } } } },
    },
  });

  const bySection = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!e.sectionId) continue;
    const list = bySection.get(e.sectionId);
    if (list) list.push(e);
    else bySection.set(e.sectionId, [e]);
  }

  return {
    dayOfWeek,
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      className: s.class.name,
      label: `${s.class.name} ${s.name}`,
      periods: (bySection.get(s.id) ?? [])
        .map((e) => ({
          period: e.period,
          subjectName: e.subject?.name ?? null,
          staffName: e.staff?.user.name ?? null,
        }))
        .sort((a, b) => a.period - b.period),
    })),
  };
}

/**
 * A staff member's own periods for one day of the week — the mobile
 * "my timetable" screen. Finds the Staff row the same way
 * role-home.ts::getTeacherHome does, then reads that one day's entries.
 * Returns null when the signed-in account has no Staff row at this school.
 */
export async function getMyTimetableForDay(schoolId: string, userId: string, dayOfWeek: number) {
  const staff = await db.staff.findFirst({
    where: { schoolId, userId },
    select: { id: true, employeeId: true, designation: true },
  });
  if (!staff) return null;

  const entries = await db.timetableEntry.findMany({
    where: { schoolId, staffId: staff.id, dayOfWeek },
    orderBy: { period: "asc" },
    include: {
      class: { select: { name: true } },
      section: { select: { name: true } },
      subject: { select: { name: true } },
    },
  });

  return {
    staff,
    dayOfWeek,
    entries: entries.map((e) => ({
      period: e.period,
      startTime: e.startTime,
      endTime: e.endTime,
      roomNo: e.roomNo,
      classId: e.classId,
      className: e.class?.name ?? null,
      sectionId: e.sectionId,
      sectionName: e.section?.name ?? null,
      subjectId: e.subjectId,
      subjectName: e.subject?.name ?? null,
    })),
  };
}
