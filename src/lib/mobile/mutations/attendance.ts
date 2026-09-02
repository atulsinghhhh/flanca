import { db } from "@/lib/db";
import { audit, hasRole, OFFICE, type Actor } from "@/lib/session";
import { schoolToday, isoDay } from "@/lib/queries/when";
import { attendanceClientKey } from "@/lib/core/attendance-core";
import type { AttendanceStatus } from "@prisma/client";

export type MarkInput = { studentId: string; status: AttendanceStatus };

export type SaveAttendanceResult =
  | { ok: false; status: number; code: string; message: string }
  | { ok: true; saved: number; absent: number; rejected: number };

/**
 * The mobile-API twin of src/app/app/attendance/actions.ts::saveAttendance —
 * same idempotent upsert-by-clientKey, same authorization, callable from any
 * mobile route (the direct write and the "mark all present" convenience path)
 * without re-deriving the actor twice.
 */
export async function saveAttendanceForActor(
  actor: Actor,
  sectionId: string,
  input: { date: string; marks: MarkInput[]; period?: number },
): Promise<SaveAttendanceResult> {
  const section = await db.section.findFirst({
    where: { id: sectionId, schoolId: actor.schoolId },
    include: { class: { select: { id: true, name: true } } },
  });
  if (!section) return { ok: false, status: 404, code: "not_found", message: "That section is not in this school." };

  if (!hasRole(actor, ...OFFICE) && section.classTeacherId !== actor.id) {
    return { ok: false, status: 403, code: "forbidden", message: "Only that section's class teacher can mark its attendance." };
  }

  const parsed = new Date(`${input.date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { ok: false, status: 422, code: "invalid_date", message: "That date is not valid." };
  const day = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  if (day.getTime() > schoolToday().getTime()) {
    return { ok: false, status: 422, code: "future_date", message: "Attendance cannot be marked for a future date." };
  }

  // Same lock as the web action: a teacher marks once, then it's the office's
  // call to reopen it — enforced here too so the mobile app can't bypass it.
  if (!hasRole(actor, ...OFFICE)) {
    const lock = await db.attendanceLock.findUnique({
      where: { schoolId_sectionId_date: { schoolId: actor.schoolId, sectionId: section.id, date: day } },
    });
    if (lock) {
      return {
        ok: false,
        status: 409,
        code: "locked",
        message: "This day's attendance is locked. Ask the office to unlock it before you can change it.",
      };
    }
  }

  const period = input.period ?? 0;

  const roll = await db.student.findMany({
    where: { schoolId: actor.schoolId, sectionId: section.id, status: "ACTIVE" },
    select: { id: true },
  });
  const onRoll = new Set(roll.map((r) => r.id));

  const accepted = input.marks.filter((m) => onRoll.has(m.studentId));
  const rejected = input.marks.length - accepted.length;
  if (accepted.length === 0) {
    return { ok: false, status: 422, code: "no_valid_students", message: "None of those students are on this section's roll any more." };
  }

  await db.$transaction(
    async (tx) => {
      for (const m of accepted) {
        const clientKey = attendanceClientKey({ studentId: m.studentId, date: day, period });
        await tx.attendance.upsert({
          where: { schoolId_clientKey: { schoolId: actor.schoolId, clientKey } },
          create: {
            schoolId: actor.schoolId,
            date: day,
            classId: section.class.id,
            sectionId: section.id,
            studentId: m.studentId,
            period,
            status: m.status,
            markedByUserId: actor.id,
            markedAt: new Date(),
            clientKey,
            syncedAt: new Date(),
          },
          update: {
            status: m.status,
            markedByUserId: actor.id,
            markedAt: new Date(),
            syncedAt: new Date(),
          },
        });
      }
    },
    { timeout: 60_000 },
  );

  await db.attendanceLock.upsert({
    where: { schoolId_sectionId_date: { schoolId: actor.schoolId, sectionId: section.id, date: day } },
    create: { schoolId: actor.schoolId, sectionId: section.id, date: day, lockedByUserId: actor.id },
    update: { lockedByUserId: actor.id, lockedAt: new Date() },
  });

  const absent = accepted.filter((m) => m.status === "ABSENT").length;

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "attendance.mark",
    entity: "Section",
    entityId: section.id,
    summary: `Marked ${section.class.name} ${section.name} for ${isoDay(day)}: ${accepted.length} students, ${absent} absent`,
    after: { count: accepted.length, absent },
  });

  return { ok: true, saved: accepted.length, absent, rejected };
}
