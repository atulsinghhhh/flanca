import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import { canAllot, canDeleteRoom, validateRoom, type OpsMessage, type RoomField } from "@/lib/core/operations-core";

/**
 * The mobile-API twin of src/app/app/hostel/actions.ts.
 *
 * Same rules (validateRoom / canAllot / canDeleteRoom from operations-core,
 * never re-derived), same db writes, same audit trail — just handed an
 * `actor` instead of calling `requireRole(...OFFICE)`, and returning a
 * discriminated result instead of the `{error}`/`{ok}` shape a server
 * action's caller expects. revalidatePath is a page-cache concern with
 * nothing to invalidate for a stateless JSON client, so it is dropped here.
 */

type Failure = { ok: false; status: number; code: string; message: string };

const notFound = (message: string): Failure => ({ ok: false, status: 404, code: "not_found", message });
const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });
const conflict = (message: string): Failure => ({ ok: false, status: 409, code: "conflict", message });

export type SaveRoomInput = {
  roomId?: string | null;
  roomNo: string;
  block?: string | null;
  capacity: number;
  kind?: string | null;
  wardenName?: string | null;
};

export type SaveRoomResult = Failure | { ok: true; roomId: string; messages: OpsMessage<RoomField>[] };

/** Mirrors src/app/app/hostel/actions.ts::saveRoom. */
export async function saveRoomForActor(actor: Actor, input: SaveRoomInput): Promise<SaveRoomResult> {
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
    return invalid(check.messages.find((m) => m.level === "ERROR")!.message);
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
  if (input.roomId && !existing) return notFound("That room is not in this school.");

  // Shrinking a room below the number of children in it would leave somebody
  // without a bed on paper while they are still sleeping in it.
  if (existing && input.capacity < existing.allotments.length) {
    return conflict(
      `${existing.allotments.length} children are in room ${existing.roomNo}, so it cannot be set to ${input.capacity} beds.`,
    );
  }

  const data = {
    roomNo,
    block: input.block?.trim() || null,
    capacity: input.capacity,
    kind: input.kind === "BOYS" || input.kind === "GIRLS" ? input.kind : null,
    wardenName: input.wardenName?.trim() || null,
  };

  const room = existing
    ? await db.hostelRoom.update({ where: { id: existing.id }, data, select: { id: true } })
    : await db.hostelRoom.create({ data: { schoolId: actor.schoolId, ...data }, select: { id: true } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: existing ? "school.hostel.room.update" : "school.hostel.room.create",
    entity: "HostelRoom",
    entityId: existing?.id ?? room.id,
    summary: existing
      ? `Changed hostel room ${existing.roomNo}${roomNo !== existing.roomNo ? ` to ${roomNo}` : ""}`
      : `Added hostel room ${roomNo}, ${input.capacity} ${input.capacity === 1 ? "bed" : "beds"}` +
        (data.kind ? `, ${data.kind.toLowerCase()}` : ""),
    before: existing ? { roomNo: existing.roomNo, capacity: existing.capacity, kind: existing.kind, wardenName: existing.wardenName } : undefined,
    after: data,
    reversible: Boolean(existing),
  });

  return { ok: true, roomId: room.id, messages: check.messages };
}

export type DeleteRoomResult = Failure | { ok: true };

/** Mirrors src/app/app/hostel/actions.ts::deleteRoom — blocked if the room has ever held an allotment. */
export async function deleteRoomForActor(actor: Actor, roomId: string): Promise<DeleteRoomResult> {
  const room = await db.hostelRoom.findFirst({
    where: { id: roomId, schoolId: actor.schoolId },
    select: { id: true, roomNo: true, _count: { select: { allotments: true } } },
  });
  if (!room) return notFound("That room is not in this school.");

  const guard = canDeleteRoom({ allotments: room._count.allotments });
  if (!guard.allowed) return conflict(guard.reason!);

  await db.hostelRoom.delete({ where: { id: room.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.hostel.room.delete",
    entity: "HostelRoom",
    entityId: room.id,
    summary: `Removed hostel room ${room.roomNo}, which nobody had stayed in`,
  });

  return { ok: true };
}

export type AllotBedInput = {
  studentId: string;
  roomId: string;
  bedNo?: string | null;
  fromIso?: string | null;
};

export type AllotBedResult = Failure | { ok: true };

/** Mirrors src/app/app/hostel/actions.ts::allotBed. */
export async function allotBedForActor(actor: Actor, input: AllotBedInput): Promise<AllotBedResult> {
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
  if (!student) return notFound("That child is not on this school's roll.");
  if (!room) return notFound("That room is not in this school.");

  const guard = canAllot({
    capacity: room.capacity,
    occupied: room.allotments.length,
    roomKind: room.kind,
    studentGender: student.gender,
    studentStatus: student.status,
    alreadyInARoom: student.hostelAllotments.length > 0,
  });
  if (!guard.allowed) return conflict(guard.reason!);

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

  return { ok: true };
}

export type EndAllotmentResult = Failure | { ok: true };

/** A child leaving the hostel. The allotment stays, with an end date. Mirrors src/app/app/hostel/actions.ts::endAllotment. */
export async function endAllotmentForActor(actor: Actor, allotmentId: string): Promise<EndAllotmentResult> {
  const row = await db.hostelAllotment.findFirst({
    where: { id: allotmentId, schoolId: actor.schoolId },
    select: { id: true, toDate: true, student: { select: { id: true, name: true } }, room: { select: { roomNo: true } } },
  });
  if (!row) return notFound("That allotment is not in this school.");
  if (row.toDate) return { ok: true };

  await db.hostelAllotment.update({ where: { id: row.id }, data: { toDate: new Date() } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.hostel.leave",
    entity: "Student",
    entityId: row.student.id,
    summary: `${row.student.name} has left hostel room ${row.room.roomNo}. The bed is free.`,
  });

  return { ok: true };
}
