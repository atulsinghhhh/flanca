import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import { formatMoney, paiseFromText } from "@/lib/core/money";
import { canBoard, canDeleteRoute, canDeleteStop, validateRoute, type RouteField, type OpsMessage } from "@/lib/core/operations-core";

/**
 * The mobile-API twin of src/app/app/transport/actions.ts — the OFFICE-side
 * route/stop/boarding CRUD. Separate from src/lib/queries/transport.ts's
 * getMyTransport, which is the read-only "which bus is my child on" view for
 * a student or parent.
 *
 * Same rules (validateRoute / canBoard / canDeleteRoute / canDeleteStop from
 * operations-core, never re-derived), same db writes, same audit trail —
 * just handed an `actor` instead of calling `requireRole(...OFFICE)`, and
 * returning a discriminated result instead of the `{error}`/`{ok}` shape a
 * server action's caller expects. revalidatePath is a page-cache concern
 * with nothing to invalidate for a stateless JSON client, so it is dropped
 * here.
 */

type Failure = { ok: false; status: number; code: string; message: string };

const notFound = (message: string): Failure => ({ ok: false, status: 404, code: "not_found", message });
const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });
const conflict = (message: string): Failure => ({ ok: false, status: 409, code: "conflict", message });

export type CreateRouteInput = {
  name: string;
  vehicleNo?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  attendantName?: string | null;
  capacity?: number | null;
};

export type CreateRouteResult = Failure | { ok: true; routeId: string; messages: OpsMessage<RouteField>[] };

/** Mirrors src/app/app/transport/actions.ts::createRoute. */
export async function createRouteForActor(actor: Actor, input: CreateRouteInput): Promise<CreateRouteResult> {
  const existing = await db.transportRoute.findMany({
    where: { schoolId: actor.schoolId },
    select: { name: true },
  });
  const check = validateRoute({
    name: input.name,
    vehicleNo: input.vehicleNo ?? null,
    capacity: input.capacity ?? null,
    driverPhone: input.driverPhone ?? null,
    existingNames: existing.map((e) => e.name),
  });
  if (!check.ok) {
    return invalid(check.messages.find((m) => m.level === "ERROR")!.message);
  }

  const name = input.name.trim().replace(/\s+/g, " ");
  const route = await db.transportRoute.create({
    data: {
      schoolId: actor.schoolId,
      name,
      vehicleNo: input.vehicleNo?.trim() || null,
      driverName: input.driverName?.trim() || null,
      driverPhone: input.driverPhone?.replace(/\D/g, "") || null,
      attendantName: input.attendantName?.trim() || null,
      capacity: input.capacity ?? null,
    },
    select: { id: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.route.create",
    entity: "TransportRoute",
    entityId: route.id,
    summary:
      `Added the bus route ${name}` +
      (input.capacity ? `, ${input.capacity} seats` : "") +
      (input.driverName ? `, driven by ${input.driverName.trim()}` : ""),
  });

  return { ok: true, routeId: route.id, messages: check.messages };
}

export type UpdateRouteInput = {
  routeId: string;
  name: string;
  vehicleNo?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  attendantName?: string | null;
  capacity?: number | null;
  isActive?: boolean;
};

export type UpdateRouteResult = Failure | { ok: true; messages: OpsMessage<RouteField>[] };

/** Mirrors src/app/app/transport/actions.ts::updateRoute. */
export async function updateRouteForActor(actor: Actor, input: UpdateRouteInput): Promise<UpdateRouteResult> {
  const before = await db.transportRoute.findFirst({
    where: { id: input.routeId, schoolId: actor.schoolId },
    select: {
      id: true, name: true, vehicleNo: true, driverName: true, driverPhone: true,
      attendantName: true, capacity: true, isActive: true,
      _count: { select: { students: true } },
    },
  });
  if (!before) return notFound("That route is not in this school.");

  const siblings = await db.transportRoute.findMany({
    where: { schoolId: actor.schoolId, id: { not: before.id } },
    select: { name: true },
  });
  const check = validateRoute({
    name: input.name,
    vehicleNo: input.vehicleNo ?? null,
    capacity: input.capacity ?? null,
    driverPhone: input.driverPhone ?? null,
    existingNames: siblings.map((s) => s.name),
  });
  if (!check.ok) {
    return invalid(check.messages.find((m) => m.level === "ERROR")!.message);
  }

  // Cutting the seat count below the children already on the bus would make the
  // route silently over capacity, which is the exact thing canBoard exists to stop.
  if (input.capacity != null && input.capacity < before._count.students) {
    return conflict(
      `${before._count.students} children already use this route, so it cannot be set to ${input.capacity} seats.`,
    );
  }

  const name = input.name.trim().replace(/\s+/g, " ");
  await db.transportRoute.update({
    where: { id: before.id },
    data: {
      name,
      vehicleNo: input.vehicleNo?.trim() || null,
      driverName: input.driverName?.trim() || null,
      driverPhone: input.driverPhone?.replace(/\D/g, "") || null,
      attendantName: input.attendantName?.trim() || null,
      capacity: input.capacity ?? null,
      isActive: input.isActive ?? before.isActive,
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.route.update",
    entity: "TransportRoute",
    entityId: before.id,
    summary: `Changed the bus route ${before.name}${name !== before.name ? ` to ${name}` : ""}`,
    before: { name: before.name, vehicleNo: before.vehicleNo, driverName: before.driverName, capacity: before.capacity },
    after: { name, vehicleNo: input.vehicleNo ?? null, driverName: input.driverName ?? null, capacity: input.capacity ?? null },
    reversible: true,
  });

  return { ok: true, messages: check.messages };
}

export type DeleteRouteResult = Failure | { ok: true };

/** Mirrors src/app/app/transport/actions.ts::deleteRoute — blocked if the route has students or stops. */
export async function deleteRouteForActor(actor: Actor, routeId: string): Promise<DeleteRouteResult> {
  const route = await db.transportRoute.findFirst({
    where: { id: routeId, schoolId: actor.schoolId },
    select: { id: true, name: true, _count: { select: { students: true, stops: true } } },
  });
  if (!route) return notFound("That route is not in this school.");

  const guard = canDeleteRoute({ students: route._count.students, stops: route._count.stops });
  if (!guard.allowed) return conflict(guard.reason!);

  await db.transportRoute.delete({ where: { id: route.id } });
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.route.delete",
    entity: "TransportRoute",
    entityId: route.id,
    summary: `Removed the bus route ${route.name}, which nobody used`,
  });

  return { ok: true };
}

export type SaveStopInput = {
  stopId?: string | null;
  routeId: string;
  name: string;
  monthlyFeeText?: string | null;
  pickupTime?: string | null;
  dropTime?: string | null;
};

export type SaveStopResult = Failure | { ok: true; stopId: string };

/** A stop, and what it costs a month — the number that reaches a parent's invoice. Mirrors saveStop. */
export async function saveStopForActor(actor: Actor, input: SaveStopInput): Promise<SaveStopResult> {
  const route = await db.transportRoute.findFirst({
    where: { id: input.routeId, schoolId: actor.schoolId },
    select: { id: true, name: true, stops: { select: { id: true, name: true, sequenceOrder: true } } },
  });
  if (!route) return notFound("That route is not in this school.");

  const name = input.name.trim().replace(/\s+/g, " ");
  if (name === "") return invalid("Give the stop a name.");
  if (route.stops.some((s) => s.id !== input.stopId && s.name.toLowerCase() === name.toLowerCase())) {
    return invalid(`${route.name} already has a stop called ${name}.`);
  }

  const fee = input.monthlyFeeText?.trim() ? paiseFromText(input.monthlyFeeText) : 0;
  if (fee == null) return invalid("That fee is not an amount.");
  if (fee < 0) return invalid("A fee cannot be negative.");
  if (fee > 50_000_00) return invalid("Over ₹50,000 a month for a bus stop — check the zeroes.");

  const existing = input.stopId
    ? await db.transportStop.findFirst({
        where: { id: input.stopId, schoolId: actor.schoolId },
        select: { id: true, name: true, monthlyFee: true, _count: { select: { students: true } } },
      })
    : null;
  if (input.stopId && !existing) return notFound("That stop is not in this school.");

  const stopId = existing
    ? existing.id
    : (
        await db.transportStop.create({
          data: {
            schoolId: actor.schoolId,
            routeId: route.id,
            name,
            monthlyFee: fee,
            pickupTime: input.pickupTime?.trim() || null,
            dropTime: input.dropTime?.trim() || null,
            sequenceOrder: route.stops.reduce((a, s) => Math.max(a, s.sequenceOrder), -1) + 1,
          },
          select: { id: true },
        })
      ).id;

  if (existing) {
    await db.transportStop.update({
      where: { id: existing.id },
      data: {
        name,
        monthlyFee: fee,
        pickupTime: input.pickupTime?.trim() || null,
        dropTime: input.dropTime?.trim() || null,
      },
    });
  }

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: existing ? "school.stop.update" : "school.stop.create",
    entity: "TransportStop",
    entityId: stopId,
    summary: existing
      ? `${route.name}: ${existing.name} is now ${formatMoney(fee)} a month` +
        (existing.monthlyFee !== fee
          ? `, was ${formatMoney(existing.monthlyFee)}. The ${existing._count.students} ${existing._count.students === 1 ? "child" : "children"} using it will be billed the new amount from the next invoice.`
          : ".")
      : `${route.name}: added the stop ${name} at ${formatMoney(fee)} a month`,
    before: existing ? { name: existing.name, monthlyFee: existing.monthlyFee } : undefined,
    after: { name, monthlyFee: fee },
    reversible: Boolean(existing),
  });

  return { ok: true, stopId };
}

export type DeleteStopResult = Failure | { ok: true };

/** Mirrors src/app/app/transport/actions.ts::deleteStop — blocked if anyone is picked up there. */
export async function deleteStopForActor(actor: Actor, stopId: string): Promise<DeleteStopResult> {
  const stop = await db.transportStop.findFirst({
    where: { id: stopId, schoolId: actor.schoolId },
    select: { id: true, name: true, _count: { select: { students: true } } },
  });
  if (!stop) return notFound("That stop is not in this school.");

  const guard = canDeleteStop({ students: stop._count.students });
  if (!guard.allowed) return conflict(guard.reason!);

  await db.transportStop.delete({ where: { id: stop.id } });
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.stop.delete",
    entity: "TransportStop",
    entityId: stop.id,
    summary: `Removed the stop ${stop.name}, which nobody used`,
  });

  return { ok: true };
}

export type BoardStudentInput = {
  studentId: string;
  routeId: string;
  stopId?: string | null;
  fromIso?: string | null;
};

export type BoardStudentResult = Failure | { ok: true };

/** Put a child on a bus, at a stop, from a date. Mirrors boardStudent. */
export async function boardStudentForActor(actor: Actor, input: BoardStudentInput): Promise<BoardStudentResult> {
  const [student, route] = await Promise.all([
    db.student.findFirst({
      where: { id: input.studentId, schoolId: actor.schoolId },
      select: { id: true, name: true, status: true, transport: { select: { routeId: true } } },
    }),
    db.transportRoute.findFirst({
      where: { id: input.routeId, schoolId: actor.schoolId },
      select: {
        id: true, name: true, capacity: true,
        _count: { select: { students: true } },
        stops: { select: { id: true, name: true, monthlyFee: true } },
      },
    }),
  ]);
  if (!student) return notFound("That child is not on this school's roll.");
  if (!route) return notFound("That route is not in this school.");

  const guard = canBoard({
    capacity: route.capacity,
    onBoard: route._count.students,
    studentStatus: student.status,
    alreadyOnThisRoute: student.transport.some((t) => t.routeId === route.id),
  });
  if (!guard.allowed) return conflict(guard.reason!);

  const stop = input.stopId ? route.stops.find((s) => s.id === input.stopId) : null;
  if (input.stopId && !stop) return notFound("That stop is not on this route.");

  await db.studentTransport.create({
    data: {
      schoolId: actor.schoolId,
      studentId: student.id,
      routeId: route.id,
      stopId: stop?.id ?? null,
      fromDate: input.fromIso ? new Date(`${input.fromIso}T00:00:00.000Z`) : new Date(),
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.transport.board",
    entity: "Student",
    entityId: student.id,
    summary:
      `${student.name} now uses the ${route.name} bus` +
      (stop ? ` from ${stop.name}, ${formatMoney(stop.monthlyFee)} a month` : "") +
      ". The transport line appears on their next invoice.",
  });

  return { ok: true };
}

export type UnboardStudentResult = Failure | { ok: true };

/** Mirrors src/app/app/transport/actions.ts::unboardStudent. */
export async function unboardStudentForActor(actor: Actor, studentTransportId: string): Promise<UnboardStudentResult> {
  const row = await db.studentTransport.findFirst({
    where: { id: studentTransportId, schoolId: actor.schoolId },
    select: { id: true, student: { select: { id: true, name: true } }, route: { select: { name: true } } },
  });
  if (!row) return notFound("That is not in this school.");

  await db.studentTransport.delete({ where: { id: row.id } });
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.transport.unboard",
    entity: "Student",
    entityId: row.student.id,
    summary: `${row.student.name} no longer uses the ${row.route.name} bus. Invoices already raised keep the transport line.`,
  });

  return { ok: true };
}
