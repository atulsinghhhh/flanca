"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { canAllot, canDeleteRoom, validateRoom } from "@/lib/core/operations-core";

/**
 * The hostel.
 *
 * Rooms and beds were seed-only, so a school could not add a room, change a warden,
 * or give a child a bed. Two rules do the work: a room cannot hold more children
 * than it has beds, and a boys' room is for boys — putting a child in the wrong wing
 * is not a data-entry slip a school can explain away afterwards.
 */

export async function saveRoom(input: {
  roomId?: string | null;
  roomNo: string;
  block?: string | null;
  capacity: number;
  kind?: string | null;
  wardenName?: string | null;
}) {
  const actor = await requireRole(...OFFICE);

  const rooms = await db.hostelRoom.findMany({
    where: { schoolId: actor.schoolId },
    select: { id: true, roomNo: true },
  });
  const check = validateRoom({
    roomNo: input.roomNo,
    capacity: input.capacity,
    kind: input.kind ?? null,
    existingRoomNos: rooms.filter((r) => r.id !== input.roomId).map((r) => r.roomNo),
  });
  if (!check.ok) {
    return { error: check.messages.find((m) => m.level === "ERROR")!.message, messages: check.messages };
  }

  const roomNo = input.roomNo.trim().replace(/\s+/g, " ");
  const existing = input.roomId
    ? await db.hostelRoom.findFirst({
        where: { id: input.roomId, schoolId: actor.schoolId },
        select: {
          id: true, roomNo: true, capacity: true, kind: true, wardenName: true, block: true,
          allotments: { where: { toDate: null }, select: { id: true } },
        },
      })
    : null;
  if (input.roomId && !existing) return { error: "That room is not in this school." };

  // Shrinking a room below the number of children in it would leave somebody without
  // a bed on paper while they are still sleeping in it.
  if (existing && input.capacity < existing.allotments.length) {
    return {
      error: `${existing.allotments.length} children are in room ${existing.roomNo}, so it cannot be set to ${input.capacity} beds.`,
    };
  }

  const data = {
    roomNo,
    block: input.block?.trim() || null,
    capacity: input.capacity,
    kind: input.kind === "BOYS" || input.kind === "GIRLS" ? input.kind : null,
    wardenName: input.wardenName?.trim() || null,
  };

  if (existing) await db.hostelRoom.update({ where: { id: existing.id }, data });
  else await db.hostelRoom.create({ data: { schoolId: actor.schoolId, ...data } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: existing ? "school.hostel.room.update" : "school.hostel.room.create",
    entity: "HostelRoom",
    entityId: existing?.id ?? actor.schoolId,
    summary: existing
      ? `Changed hostel room ${existing.roomNo}${roomNo !== existing.roomNo ? ` to ${roomNo}` : ""}`
      : `Added hostel room ${roomNo}, ${input.capacity} ${input.capacity === 1 ? "bed" : "beds"}` +
        (data.kind ? `, ${data.kind.toLowerCase()}` : ""),
    before: existing ? { roomNo: existing.roomNo, capacity: existing.capacity, kind: existing.kind, wardenName: existing.wardenName } : undefined,
    after: data,
    reversible: Boolean(existing),
  });

  revalidatePath("/app/hostel");
  return { ok: true as const, messages: check.messages };
}

export async function deleteRoom(input: { roomId: string }) {
  const actor = await requireRole(...OFFICE);

  const room = await db.hostelRoom.findFirst({
    where: { id: input.roomId, schoolId: actor.schoolId },
    select: { id: true, roomNo: true, _count: { select: { allotments: true } } },
  });
  if (!room) return { error: "That room is not in this school." };

  const guard = canDeleteRoom({ allotments: room._count.allotments });
  if (!guard.allowed) return { error: guard.reason! };

  await db.hostelRoom.delete({ where: { id: room.id } });
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.hostel.room.delete",
    entity: "HostelRoom",
    entityId: room.id,
    summary: `Removed hostel room ${room.roomNo}, which nobody had stayed in`,
  });

  revalidatePath("/app/hostel");
  return { ok: true as const };
}

/** Up to 8 active students matching a name, for the allot-a-bed search box. */
export async function searchStudentsForAllot(query: string) {
  const actor = await requireRole(...OFFICE);
  if (!query.trim()) return [];

  const students = await db.student.findMany({
    where: { schoolId: actor.schoolId, status: "ACTIVE", name: { contains: query, mode: "insensitive" } },
    select: { id: true, name: true, gender: true, class: { select: { name: true } }, section: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: 8,
  });
  return students.map((s) => ({
    id: s.id,
    name: s.name,
    sub: `${s.class?.name ?? "—"}${s.section ? ` ${s.section.name}` : ""}${s.gender ? ` · ${s.gender.charAt(0)}${s.gender.slice(1).toLowerCase()}` : ""}`,
  }));
}

export async function allotBed(input: {
  studentId: string;
  roomId: string;
  bedNo?: string | null;
  fromIso?: string | null;
}) {
  const actor = await requireRole(...OFFICE);

  const [student, room] = await Promise.all([
    db.student.findFirst({
      where: { id: input.studentId, schoolId: actor.schoolId },
      select: {
        id: true, name: true, status: true, gender: true,
        hostelAllotments: { where: { toDate: null }, select: { id: true } },
      },
    }),
    db.hostelRoom.findFirst({
      where: { id: input.roomId, schoolId: actor.schoolId },
      select: {
        id: true, roomNo: true, capacity: true, kind: true,
        allotments: { where: { toDate: null }, select: { id: true } },
      },
    }),
  ]);
  if (!student) return { error: "That child is not on this school's roll." };
  if (!room) return { error: "That room is not in this school." };

  const guard = canAllot({
    capacity: room.capacity,
    occupied: room.allotments.length,
    roomKind: room.kind,
    studentGender: student.gender,
    studentStatus: student.status,
    alreadyInARoom: student.hostelAllotments.length > 0,
  });
  if (!guard.allowed) return { error: guard.reason! };

  await db.hostelAllotment.create({
    data: {
      schoolId: actor.schoolId,
      roomId: room.id,
      studentId: student.id,
      bedNo: input.bedNo?.trim() || null,
      fromDate: input.fromIso ? new Date(`${input.fromIso}T00:00:00.000Z`) : new Date(),
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.hostel.allot",
    entity: "Student",
    entityId: student.id,
    summary: `${student.name} given a bed in hostel room ${room.roomNo}${input.bedNo?.trim() ? `, bed ${input.bedNo.trim()}` : ""}`,
  });

  revalidatePath("/app/hostel");
  revalidatePath(`/app/students/${student.id}`);
  return { ok: true as const };
}

/** A child leaving the hostel. The allotment stays, with an end date. */
export async function endAllotment(input: { allotmentId: string }) {
  const actor = await requireRole(...OFFICE);

  const row = await db.hostelAllotment.findFirst({
    where: { id: input.allotmentId, schoolId: actor.schoolId },
    select: { id: true, toDate: true, student: { select: { id: true, name: true } }, room: { select: { roomNo: true } } },
  });
  if (!row) return { error: "That allotment is not in this school." };
  if (row.toDate) return { ok: true as const };

  await db.hostelAllotment.update({ where: { id: row.id }, data: { toDate: new Date() } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.hostel.leave",
    entity: "Student",
    entityId: row.student.id,
    summary: `${row.student.name} has left hostel room ${row.room.roomNo}. The bed is free.`,
  });

  revalidatePath("/app/hostel");
  return { ok: true as const };
}
