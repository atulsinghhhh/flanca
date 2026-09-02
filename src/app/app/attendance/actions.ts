"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { schoolToday } from "@/lib/queries/when";
import { audit, requireActor, hasRole } from "@/lib/session";
import { attendanceClientKey } from "@/lib/core/attendance-core";
import { pushToUser } from "@/lib/push";
import type { AttendanceStatus } from "@prisma/client";

export type MarkInput = { studentId: string; status: AttendanceStatus };

/**
 * Save a section's attendance.
 *
 * Written to survive the exact failures the research documents: servers falling
 * over at 9 am when every teacher marks at once, and rural connections dropping
 * mid-save. Every mark carries a client-generated key, so replaying the same
 * batch after a reconnect can neither double-write nor lose an entry — the
 * teacher never has to mark a class twice.
 */
export async function saveAttendance(input: {
  sectionId: string;
  date: string;
  marks: MarkInput[];
  period?: number;
}) {
  const actor = await requireActor();
  if (!hasRole(actor, "OWNER", "PRINCIPAL", "ADMIN", "TEACHER")) {
    return { error: "You do not have permission to mark attendance." };
  }

  const section = await db.section.findFirst({
    where: { id: input.sectionId, schoolId: actor.schoolId },
    include: { class: { select: { id: true, name: true } } },
  });
  if (!section) return { error: "That section is not in this school." };

  // Attendance is one section's own register, kept by its own class teacher —
  // not everyone who has a period with the class. The page already refuses to
  // show the sheet to anyone else; this is the write path enforcing the same
  // rule, since a page guard alone is not a guarantee against the action being
  // called directly.
  if (!hasRole(actor, "OWNER", "PRINCIPAL", "ADMIN") && section.classTeacherId !== actor.id) {
    return { error: "Only that section's class teacher can mark its attendance." };
  }

  const parsed = new Date(`${input.date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { error: "That date is not valid." };

  const day = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  // "Future" means future for the SCHOOL. Judging it in UTC refused today's own
  // sheet every morning before 05:30 IST — and the client read that refusal as a
  // dropped connection, so a teacher was told the class was saved when it was not.
  if (day.getTime() > schoolToday().getTime()) {
    return { error: "Attendance cannot be marked for a future date." };
  }

  const isOffice = hasRole(actor, "OWNER", "PRINCIPAL", "ADMIN");

  // A teacher marks once, then it's locked — a typo after that goes through the
  // office, not a silent re-save. The office is not bound by its own lock: they
  // can always correct a day directly, and doing so re-locks it for the teacher.
  if (!isOffice) {
    const lock = await db.attendanceLock.findUnique({
      where: { schoolId_sectionId_date: { schoolId: actor.schoolId, sectionId: section.id, date: day } },
    });
    if (lock) {
      return { error: "This day's attendance is locked. Ask the office to unlock it before you can change it." };
    }
  }

  const period = input.period ?? 0;

  // Only students actually on this section's roll, so a stale offline batch
  // cannot write a mark against a child who has since moved class.
  const roll = await db.student.findMany({
    where: { schoolId: actor.schoolId, sectionId: section.id, status: "ACTIVE" },
    select: { id: true },
  });
  const onRoll = new Set(roll.map((r) => r.id));

  const accepted = input.marks.filter((m) => onRoll.has(m.studentId));
  const rejected = input.marks.length - accepted.length;
  if (accepted.length === 0) {
    return { error: "None of those students are on this section's roll any more." };
  }

  // Captured before the transaction so we can tell a fresh ABSENT mark apart
  // from one that was already ABSENT before this save — parents get one
  // notification per absence, not one per re-save of an unchanged sheet.
  const priorRows = await db.attendance.findMany({
    where: {
      schoolId: actor.schoolId,
      date: day,
      period,
      studentId: { in: accepted.map((m) => m.studentId) },
    },
    select: { studentId: true, status: true },
  });
  const priorStatus = new Map(priorRows.map((r) => [r.studentId, r.status]));

  // Upsert on the client key: idempotent by construction.
  await db.$transaction(
    async (tx) => {
      for (const m of accepted) {
        await tx.attendance.upsert({
          where: {
            schoolId_clientKey: {
              schoolId: actor.schoolId,
              clientKey: attendanceClientKey({ studentId: m.studentId, date: day, period }),
            },
          },
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
            clientKey: attendanceClientKey({ studentId: m.studentId, date: day, period }),
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

  // Lock the day now that it has been saved — by the teacher for the first
  // time, or by the office correcting it — so the teacher cannot quietly
  // re-open it afterward.
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
    summary: `Marked ${section.class.name} ${section.name} for ${input.date}: ${accepted.length} students, ${absent} absent`,
    after: { count: accepted.length, absent },
  });

  const newlyAbsentIds = accepted
    .filter((m) => m.status === "ABSENT" && priorStatus.get(m.studentId) !== "ABSENT")
    .map((m) => m.studentId);

  if (newlyAbsentIds.length > 0) {
    const newlyAbsent = await db.student.findMany({
      where: { id: { in: newlyAbsentIds }, schoolId: actor.schoolId },
      select: { id: true, name: true, parentLinks: { select: { userId: true } } },
    });

    const notifications = newlyAbsent.flatMap((s) =>
      s.parentLinks.map((p) => ({
        schoolId: actor.schoolId,
        userId: p.userId,
        kind: "ABSENT",
        title: "Marked absent today",
        body: `${s.name} was marked absent on ${input.date}.`,
        linkUrl: "/app/attendance",
      })),
    );

    if (notifications.length > 0) {
      await db.notification.createMany({ data: notifications, skipDuplicates: true });
      await Promise.all(
        newlyAbsent.flatMap((s) =>
          s.parentLinks.map((p) =>
            pushToUser(actor.schoolId, p.userId, {
              title: "Marked absent today",
              body: `${s.name} was marked absent on ${input.date}.`,
              url: "/app/attendance",
              tag: `attendance-absent-${s.id}-${input.date}`,
            }),
          ),
        ),
      ).catch(() => undefined);
    }
  }

  revalidatePath("/app/attendance");
  revalidatePath("/app");

  return { ok: true, saved: accepted.length, absent, rejected };
}

/** Reopen a locked day so its class teacher can correct it themselves. */
export async function unlockAttendance(sectionId: string, date: string) {
  const actor = await requireActor();
  if (!hasRole(actor, "OWNER", "PRINCIPAL", "ADMIN")) {
    return { error: "Only the office can unlock a day's attendance." };
  }

  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { error: "That date is not valid." };
  const day = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));

  const section = await db.section.findFirst({ where: { id: sectionId, schoolId: actor.schoolId } });
  if (!section) return { error: "That section is not in this school." };

  const deleted = await db.attendanceLock.deleteMany({
    where: { schoolId: actor.schoolId, sectionId, date: day },
  });
  if (deleted.count === 0) return { error: "That day is not locked." };

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "attendance.unlock",
    entity: "Section",
    entityId: sectionId,
    summary: `Unlocked ${date} attendance for re-marking`,
  });

  revalidatePath(`/app/attendance/${sectionId}`);
  return { ok: true };
}

/** Mark a whole section present in one action — the overwhelmingly common case. */
export async function markAllPresent(sectionId: string, date: string) {
  const actor = await requireActor();
  const students = await db.student.findMany({
    where: { schoolId: actor.schoolId, sectionId, status: "ACTIVE" },
    select: { id: true },
  });

  return saveAttendance({
    sectionId,
    date,
    marks: students.map((s) => ({ studentId: s.id, status: "PRESENT" as AttendanceStatus })),
  });
}

/** Staff attendance for one day. */
export async function saveStaffAttendance(input: {
  date: string;
  marks: Array<{ staffId: string; status: AttendanceStatus }>;
}) {
  const actor = await requireActor();
  if (!hasRole(actor, "OWNER", "PRINCIPAL", "ADMIN")) {
    return { error: "Only the office can mark staff attendance." };
  }

  const parsed = new Date(`${input.date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { error: "That date is not valid." };
  const day = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));

  const staff = await db.staff.findMany({
    where: { schoolId: actor.schoolId, isActive: true },
    select: { id: true },
  });
  const valid = new Set(staff.map((s) => s.id));
  const accepted = input.marks.filter((m) => valid.has(m.staffId));
  if (accepted.length === 0) return { error: "No valid staff in that list." };

  await db.$transaction(
    async (tx) => {
      for (const m of accepted) {
        await tx.attendance.upsert({
          where: {
            schoolId_clientKey: {
              schoolId: actor.schoolId,
              clientKey: `satt:${m.staffId}:${input.date}:0`,
            },
          },
          create: {
            schoolId: actor.schoolId,
            date: day,
            staffId: m.staffId,
            period: 0,
            status: m.status,
            markedByUserId: actor.id,
            clientKey: `satt:${m.staffId}:${input.date}:0`,
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

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "attendance.staff.mark",
    entity: "School",
    entityId: actor.schoolId,
    summary: `Marked staff attendance for ${input.date}: ${accepted.length} staff`,
  });

  revalidatePath("/app/attendance/staff");
  return { ok: true, saved: accepted.length };
}
