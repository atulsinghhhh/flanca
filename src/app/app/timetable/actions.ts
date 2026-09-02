"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { buildTimetable, canPlacePeriod, weekOfSlots } from "@/lib/core/timetable-core";

/**
 * Editing the timetable.
 *
 * The week could be looked at but never changed, which meant a school could not move
 * a period, cover for an absent teacher, or build a timetable at all — the seed's was
 * the only one that had ever existed.
 *
 * The rule that matters is the one the scheduler already enforces for a whole week,
 * applied to a single cell: a teacher cannot be in two rooms at once. When it
 * refuses, it says where they already are, because "no" on its own leaves somebody
 * opening thirteen other timetables to find out why.
 */

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** One period: set its subject and teacher, or clear it. */
export async function setPeriod(input: {
  sectionId: string;
  dayOfWeek: number;
  period: number;
  subjectId: string | null;
  staffId: string | null;
  roomNo?: string | null;
  meetingUrl?: string | null;
}) {
  const actor = await requireRole(...OFFICE);

  if (input.dayOfWeek < 1 || input.dayOfWeek > 6) return { error: "That is not a day of the school week." };
  if (input.period < 1 || input.period > 12) return { error: "That is not a period." };

  const section = await db.section.findFirst({
    where: { id: input.sectionId, schoolId: actor.schoolId },
    select: { id: true, name: true, classId: true, class: { select: { name: true } } },
  });
  if (!section) return { error: "That section is not in this school." };

  const existing = await db.timetableEntry.findFirst({
    where: {
      schoolId: actor.schoolId,
      sectionId: section.id,
      dayOfWeek: input.dayOfWeek,
      period: input.period,
    },
    select: { id: true, subjectId: true, staffId: true },
  });

  // Clearing a period is a legitimate act — a free period is an honest thing for a
  // timetable to contain.
  if (!input.subjectId) {
    if (!existing) return { ok: true as const };
    await db.timetableEntry.delete({ where: { id: existing.id } });
    await audit({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: "school.timetable.clear",
      entity: "Section",
      entityId: section.id,
      summary: `Cleared ${DAY_NAMES[input.dayOfWeek]} period ${input.period} for ${section.class?.name ?? ""} ${section.name}`.trim(),
    });
    revalidatePath("/app/timetable");
    return { ok: true as const };
  }

  const subject = await db.subject.findFirst({
    where: { id: input.subjectId, schoolId: actor.schoolId },
    select: { id: true, name: true, classId: true },
  });
  if (!subject) return { error: "That subject is not in this school." };
  if (subject.classId && subject.classId !== section.classId) {
    return { error: `${subject.name} is not taught in ${section.class?.name ?? "that class"}.` };
  }

  let staffName: string | null = null;
  if (input.staffId) {
    const staff = await db.staff.findFirst({
      where: { id: input.staffId, schoolId: actor.schoolId, isActive: true },
      select: { id: true, user: { select: { name: true } } },
    });
    if (!staff) return { error: "That member of staff is not active at this school." };
    staffName = staff.user.name;

    const elsewhere = await db.timetableEntry.findMany({
      where: {
        schoolId: actor.schoolId,
        dayOfWeek: input.dayOfWeek,
        period: input.period,
        staffId: input.staffId,
        NOT: { sectionId: section.id },
      },
      select: { staffId: true, section: { select: { name: true } }, class: { select: { name: true } } },
    });
    const check = canPlacePeriod({
      staffId: input.staffId,
      dayOfWeek: input.dayOfWeek,
      period: input.period,
      elsewhere: elsewhere.map((e) => ({
        staffId: e.staffId,
        sectionName: `${e.class?.name ?? ""} ${e.section?.name ?? ""}`.trim() || "another section",
      })),
    });
    if (!check.allowed) return { error: `${staffName} cannot take this period. ${check.reason}` };
  }

  const roomNo = input.roomNo?.trim() || null;
  const meetingUrl = input.meetingUrl?.trim() || null;

  if (existing) {
    await db.timetableEntry.update({
      where: { id: existing.id },
      data: { subjectId: subject.id, staffId: input.staffId, roomNo, meetingUrl },
    });
  } else {
    await db.timetableEntry.create({
      data: {
        schoolId: actor.schoolId,
        classId: section.classId,
        sectionId: section.id,
        subjectId: subject.id,
        staffId: input.staffId,
        dayOfWeek: input.dayOfWeek,
        period: input.period,
        roomNo,
        meetingUrl,
        startTime: `${String(8 + Math.floor((input.period - 1) * 45 / 60)).padStart(2, "0")}:${String(((input.period - 1) * 45) % 60).padStart(2, "0")}`,
      },
    });
  }

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.timetable.set",
    entity: "Section",
    entityId: section.id,
    summary:
      `${DAY_NAMES[input.dayOfWeek]} period ${input.period} for ${section.class?.name ?? ""} ${section.name} is now ${subject.name}` +
      (staffName ? ` with ${staffName}` : ", with nobody assigned"),
  });

  revalidatePath("/app/timetable");
  return { ok: true as const };
}

/**
 * Build a section's whole week at once.
 *
 * Uses the same scheduler the seed does, and it schedules *around* the rest of the
 * school: every other section's periods are read first, so a generated week never
 * takes a teacher who is already somewhere else.
 */
export async function generateWeek(input: { sectionId: string; periodsPerDay?: number }) {
  const actor = await requireRole(...OFFICE);

  const section = await db.section.findFirst({
    where: { id: input.sectionId, schoolId: actor.schoolId },
    select: { id: true, name: true, classId: true, class: { select: { name: true } } },
  });
  if (!section?.classId) return { error: "That section is not in this school." };

  const subjects = await db.subject.findMany({
    where: { schoolId: actor.schoolId, classId: section.classId, isCoScholastic: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, staffSubjects: { select: { staffId: true } } },
  });
  if (subjects.length === 0) return { error: `${section.class?.name ?? "That class"} has no subjects yet.` };

  const perDay = Math.min(12, Math.max(1, input.periodsPerDay ?? 8));

  // Everybody else's week, so the generated one fits around it rather than over it.
  const others = await db.timetableEntry.findMany({
    where: { schoolId: actor.schoolId, NOT: { sectionId: section.id } },
    select: { staffId: true, dayOfWeek: true, period: true },
  });
  const takenAt = new Set(others.filter((o) => o.staffId).map((o) => `${o.staffId}|${o.dayOfWeek}|${o.period}`));

  const slots = weekOfSlots([section.id], (d) => (d === 6 ? Math.min(4, perDay) : perDay));
  const built = buildTimetable({
    slots,
    sections: [
      {
        sectionId: section.id,
        subjects: subjects.map((s) => ({ subjectId: s.id, staffId: s.staffSubjects[0]?.staffId ?? null })),
      },
    ],
  });

  // buildTimetable only knows the section it was given, so anything that collides
  // with the rest of the school is dropped here rather than written and discovered
  // later.
  const usable = built.entries.filter((e) => !e.staffId || !takenAt.has(`${e.staffId}|${e.dayOfWeek}|${e.period}`));
  if (usable.length === 0) {
    return { error: "Every period would clash with a teacher who is already elsewhere. Assign more teachers to this class's subjects first." };
  }

  // Regenerating the week rebuilds every period from scratch, but a room or an
  // online-class link set by hand at a given day/period slot is worth keeping if a
  // period still lands there.
  const existingEntries = await db.timetableEntry.findMany({
    where: { schoolId: actor.schoolId, sectionId: section.id },
    select: { dayOfWeek: true, period: true, roomNo: true, meetingUrl: true },
  });
  const existingByCell = new Map(
    existingEntries.map((e) => [`${e.dayOfWeek}|${e.period}`, { roomNo: e.roomNo, meetingUrl: e.meetingUrl }]),
  );

  await db.$transaction(async (tx) => {
    await tx.timetableEntry.deleteMany({ where: { schoolId: actor.schoolId, sectionId: section.id } });
    await tx.timetableEntry.createMany({
      data: usable.map((e) => {
        const preserved = existingByCell.get(`${e.dayOfWeek}|${e.period}`);
        return {
          schoolId: actor.schoolId,
          classId: section.classId!,
          sectionId: section.id,
          subjectId: e.subjectId,
          staffId: e.staffId,
          dayOfWeek: e.dayOfWeek,
          period: e.period,
          roomNo: preserved?.roomNo ?? null,
          meetingUrl: preserved?.meetingUrl ?? null,
          startTime: `${String(8 + Math.floor((e.period - 1) * 45 / 60)).padStart(2, "0")}:${String(((e.period - 1) * 45) % 60).padStart(2, "0")}`,
        };
      }),
    });
  });

  const dropped = slots.length - usable.length;
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.timetable.generate",
    entity: "Section",
    entityId: section.id,
    summary:
      `Rebuilt the week for ${section.class?.name ?? ""} ${section.name}: ${usable.length} periods, nobody double-booked` +
      (dropped > 0 ? `, ${dropped} left free because every teacher for the remaining subjects was elsewhere` : ""),
  });

  revalidatePath("/app/timetable");
  return { ok: true as const, placed: usable.length, free: dropped };
}
