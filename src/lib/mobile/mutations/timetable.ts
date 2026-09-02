import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import { buildTimetable, canPlacePeriod, weekOfSlots } from "@/lib/core/timetable-core";

/**
 * The mobile-API twin of src/app/app/timetable/actions.ts — same rules
 * (a teacher cannot be double-booked; the scheduler fits a generated week
 * around the rest of the school), but taking `actor` as a parameter instead
 * of resolving it via `requireRole` internally, and returning a discriminated
 * result instead of `{error}` / redirect-driven revalidation, so it is
 * callable from a stateless JSON route.
 */

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type SetPeriodInput = {
  sectionId: string;
  dayOfWeek: number;
  period: number;
  subjectId: string | null;
  staffId: string | null;
};

export type SetPeriodResult =
  | { ok: false; status: number; code: string; message: string }
  | { ok: true };

/** Mirrors src/app/app/timetable/actions.ts::setPeriod. */
export async function setPeriodForActor(actor: Actor, input: SetPeriodInput): Promise<SetPeriodResult> {
  if (input.dayOfWeek < 1 || input.dayOfWeek > 6) {
    return { ok: false, status: 422, code: "invalid_day", message: "That is not a day of the school week." };
  }
  if (input.period < 1 || input.period > 12) {
    return { ok: false, status: 422, code: "invalid_period", message: "That is not a period." };
  }

  const section = await db.section.findFirst({
    where: { id: input.sectionId, schoolId: actor.schoolId },
    select: { id: true, name: true, classId: true, class: { select: { name: true } } },
  });
  if (!section) return { ok: false, status: 404, code: "not_found", message: "That section is not in this school." };

  const existing = await db.timetableEntry.findFirst({
    where: {
      schoolId: actor.schoolId,
      sectionId: section.id,
      dayOfWeek: input.dayOfWeek,
      period: input.period,
    },
    select: { id: true, subjectId: true, staffId: true },
  });

  // Clearing a period is a legitimate act — a free period is an honest thing
  // for a timetable to contain.
  if (!input.subjectId) {
    if (existing) {
      await db.timetableEntry.delete({ where: { id: existing.id } });
      await audit({
        schoolId: actor.schoolId,
        actorId: actor.id,
        action: "school.timetable.clear",
        entity: "Section",
        entityId: section.id,
        summary: `Cleared ${DAY_NAMES[input.dayOfWeek]} period ${input.period} for ${section.class?.name ?? ""} ${section.name}`.trim(),
      });
    }
    return { ok: true };
  }

  const subject = await db.subject.findFirst({
    where: { id: input.subjectId, schoolId: actor.schoolId },
    select: { id: true, name: true, classId: true },
  });
  if (!subject) return { ok: false, status: 404, code: "subject_not_found", message: "That subject is not in this school." };
  if (subject.classId && subject.classId !== section.classId) {
    return {
      ok: false,
      status: 422,
      code: "subject_wrong_class",
      message: `${subject.name} is not taught in ${section.class?.name ?? "that class"}.`,
    };
  }

  let staffName: string | null = null;
  if (input.staffId) {
    const staff = await db.staff.findFirst({
      where: { id: input.staffId, schoolId: actor.schoolId, isActive: true },
      select: { id: true, user: { select: { name: true } } },
    });
    if (!staff) {
      return { ok: false, status: 404, code: "staff_not_found", message: "That member of staff is not active at this school." };
    }
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
    if (!check.allowed) {
      return {
        ok: false,
        status: 409,
        code: "staff_conflict",
        message: `${staffName} cannot take this period. ${check.reason}`,
      };
    }
  }

  if (existing) {
    await db.timetableEntry.update({
      where: { id: existing.id },
      data: { subjectId: subject.id, staffId: input.staffId },
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

  return { ok: true };
}

export type GenerateWeekInput = { sectionId: string; periodsPerDay?: number };

export type GenerateWeekResult =
  | { ok: false; status: number; code: string; message: string }
  | { ok: true; placed: number; free: number };

/** Mirrors src/app/app/timetable/actions.ts::generateWeek. */
export async function generateWeekForActor(actor: Actor, input: GenerateWeekInput): Promise<GenerateWeekResult> {
  const section = await db.section.findFirst({
    where: { id: input.sectionId, schoolId: actor.schoolId },
    select: { id: true, name: true, classId: true, class: { select: { name: true } } },
  });
  if (!section?.classId) return { ok: false, status: 404, code: "not_found", message: "That section is not in this school." };

  const subjects = await db.subject.findMany({
    where: { schoolId: actor.schoolId, classId: section.classId, isCoScholastic: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, staffSubjects: { select: { staffId: true } } },
  });
  if (subjects.length === 0) {
    return { ok: false, status: 422, code: "no_subjects", message: `${section.class?.name ?? "That class"} has no subjects yet.` };
  }

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

  // buildTimetable only knows the section it was given, so anything that
  // collides with the rest of the school is dropped here rather than written
  // and discovered later.
  const usable = built.entries.filter((e) => !e.staffId || !takenAt.has(`${e.staffId}|${e.dayOfWeek}|${e.period}`));
  if (usable.length === 0) {
    return {
      ok: false,
      status: 409,
      code: "all_conflict",
      message: "Every period would clash with a teacher who is already elsewhere. Assign more teachers to this class's subjects first.",
    };
  }

  await db.$transaction(async (tx) => {
    await tx.timetableEntry.deleteMany({ where: { schoolId: actor.schoolId, sectionId: section.id } });
    await tx.timetableEntry.createMany({
      data: usable.map((e) => ({
        schoolId: actor.schoolId,
        classId: section.classId!,
        sectionId: section.id,
        subjectId: e.subjectId,
        staffId: e.staffId,
        dayOfWeek: e.dayOfWeek,
        period: e.period,
        startTime: `${String(8 + Math.floor((e.period - 1) * 45 / 60)).padStart(2, "0")}:${String(((e.period - 1) * 45) % 60).padStart(2, "0")}`,
      })),
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

  return { ok: true, placed: usable.length, free: dropped };
}
