"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { formatMoney, paiseFromText } from "@/lib/core/money";
import { canBoard, canDeleteRoute, canDeleteStop, validateRoute } from "@/lib/core/operations-core";

/**
 * The buses.
 *
 * The screen listed routes, stops and who is on them, and could change none of it —
 * so a school could not add a route, move a stop's fee, or put a child on a bus. The
 * transport fee on an invoice comes from the child's own stop, which makes this a
 * money screen wearing an operations hat.
 */

export async function createRoute(input: {
  name: string;
  vehicleNo?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  attendantName?: string | null;
  capacity?: number | null;
}) {
  const actor = await requireRole(...OFFICE);

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
    return { error: check.messages.find((m) => m.level === "ERROR")!.message, messages: check.messages };
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

  revalidatePath("/app/transport");
  return { ok: true as const, messages: check.messages };
}

export async function updateRoute(input: {
  routeId: string;
  name: string;
  vehicleNo?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  attendantName?: string | null;
  capacity?: number | null;
  isActive?: boolean;
}) {
  const actor = await requireRole(...OFFICE);

  const before = await db.transportRoute.findFirst({
    where: { id: input.routeId, schoolId: actor.schoolId },
    select: {
      id: true, name: true, vehicleNo: true, driverName: true, driverPhone: true,
      attendantName: true, capacity: true, isActive: true,
      _count: { select: { students: true } },
    },
  });
  if (!before) return { error: "That route is not in this school." };

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
    return { error: check.messages.find((m) => m.level === "ERROR")!.message, messages: check.messages };
  }

  // Cutting the seat count below the children already on the bus would make the
  // route silently over capacity, which is the exact thing canBoard exists to stop.
  if (input.capacity != null && input.capacity < before._count.students) {
    return {
      error: `${before._count.students} children already use this route, so it cannot be set to ${input.capacity} seats.`,
    };
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

  revalidatePath("/app/transport");
  return { ok: true as const, messages: check.messages };
}

export async function deleteRoute(input: { routeId: string }) {
  const actor = await requireRole(...OFFICE);

  const route = await db.transportRoute.findFirst({
    where: { id: input.routeId, schoolId: actor.schoolId },
    select: { id: true, name: true, _count: { select: { students: true, stops: true } } },
  });
  if (!route) return { error: "That route is not in this school." };

  const guard = canDeleteRoute({ students: route._count.students, stops: route._count.stops });
  if (!guard.allowed) return { error: guard.reason! };

  await db.transportRoute.delete({ where: { id: route.id } });
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.route.delete",
    entity: "TransportRoute",
    entityId: route.id,
    summary: `Removed the bus route ${route.name}, which nobody used`,
  });

  revalidatePath("/app/transport");
  return { ok: true as const };
}

/** A stop, and what it costs a month — the number that reaches a parent's invoice. */
export async function saveStop(input: {
  stopId?: string | null;
  routeId: string;
  name: string;
  monthlyFeeText?: string | null;
  pickupTime?: string | null;
  dropTime?: string | null;
}) {
  const actor = await requireRole(...OFFICE);

  const route = await db.transportRoute.findFirst({
    where: { id: input.routeId, schoolId: actor.schoolId },
    select: { id: true, name: true, stops: { select: { id: true, name: true, sequenceOrder: true } } },
  });
  if (!route) return { error: "That route is not in this school." };

  const name = input.name.trim().replace(/\s+/g, " ");
  if (name === "") return { error: "Give the stop a name." };
  if (route.stops.some((s) => s.id !== input.stopId && s.name.toLowerCase() === name.toLowerCase())) {
    return { error: `${route.name} already has a stop called ${name}.` };
  }

  const fee = input.monthlyFeeText?.trim() ? paiseFromText(input.monthlyFeeText) : 0;
  if (fee == null) return { error: "That fee is not an amount." };
  if (fee < 0) return { error: "A fee cannot be negative." };
  if (fee > 50_000_00) return { error: "Over ₹50,000 a month for a bus stop — check the zeroes." };

  const existing = input.stopId
    ? await db.transportStop.findFirst({
        where: { id: input.stopId, schoolId: actor.schoolId },
        select: { id: true, name: true, monthlyFee: true, _count: { select: { students: true } } },
      })
    : null;
  if (input.stopId && !existing) return { error: "That stop is not in this school." };

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
  } else {
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
    });
  }

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: existing ? "school.stop.update" : "school.stop.create",
    entity: "TransportStop",
    entityId: existing?.id ?? route.id,
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

  revalidatePath("/app/transport");
  return { ok: true as const };
}

export async function deleteStop(input: { stopId: string }) {
  const actor = await requireRole(...OFFICE);

  const stop = await db.transportStop.findFirst({
    where: { id: input.stopId, schoolId: actor.schoolId },
    select: { id: true, name: true, _count: { select: { students: true } } },
  });
  if (!stop) return { error: "That stop is not in this school." };

  const guard = canDeleteStop({ students: stop._count.students });
  if (!guard.allowed) return { error: guard.reason! };

  await db.transportStop.delete({ where: { id: stop.id } });
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.stop.delete",
    entity: "TransportStop",
    entityId: stop.id,
    summary: `Removed the stop ${stop.name}, which nobody used`,
  });

  revalidatePath("/app/transport");
  return { ok: true as const };
}

/** Up to 8 active students matching a name, for the board-a-student search box. */
export async function searchStudents(query: string) {
  const actor = await requireRole(...OFFICE);
  const q = query.trim();
  if (!q) return [];

  const students = await db.student.findMany({
    where: { schoolId: actor.schoolId, status: "ACTIVE", name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true, class: { select: { name: true } }, section: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: 8,
  });
  return students.map((s) => ({
    id: s.id,
    name: s.name,
    sub: `${s.class?.name ?? "—"}${s.section ? ` ${s.section.name}` : ""}`,
  }));
}

/** Put a child on a bus, at a stop, from a date. */
export async function boardStudent(input: {
  studentId: string;
  routeId: string;
  stopId?: string | null;
  fromIso?: string | null;
}) {
  const actor = await requireRole(...OFFICE);

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
  if (!student) return { error: "That child is not on this school's roll." };
  if (!route) return { error: "That route is not in this school." };

  const guard = canBoard({
    capacity: route.capacity,
    onBoard: route._count.students,
    studentStatus: student.status,
    alreadyOnThisRoute: student.transport.some((t) => t.routeId === route.id),
  });
  if (!guard.allowed) return { error: guard.reason! };

  const stop = input.stopId ? route.stops.find((s) => s.id === input.stopId) : null;
  if (input.stopId && !stop) return { error: "That stop is not on this route." };

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

  revalidatePath("/app/transport");
  revalidatePath(`/app/students/${student.id}`);
  return { ok: true as const };
}

export async function unboardStudent(input: { studentTransportId: string }) {
  const actor = await requireRole(...OFFICE);

  const row = await db.studentTransport.findFirst({
    where: { id: input.studentTransportId, schoolId: actor.schoolId },
    select: { id: true, student: { select: { id: true, name: true } }, route: { select: { name: true } } },
  });
  if (!row) return { error: "That is not in this school." };

  await db.studentTransport.delete({ where: { id: row.id } });
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.transport.unboard",
    entity: "Student",
    entityId: row.student.id,
    summary: `${row.student.name} no longer uses the ${row.route.name} bus. Invoices already raised keep the transport line.`,
  });

  revalidatePath("/app/transport");
  revalidatePath(`/app/students/${row.student.id}`);
  return { ok: true as const };
}
