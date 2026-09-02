/**
 * The parts of a school that are not lessons: the buses, the hostel, the store
 * cupboard. Pure.
 *
 * All three screens showed what the seed had put there and could change none of it.
 * They are grouped in one file because they share one shape — a thing, a count of
 * how much of it there is, and a rule about not promising more than exists. A bus
 * with 40 seats and 44 children on it, a room for two with three beds allotted, and
 * a cupboard issuing chalk it does not have are the same mistake three times.
 */

export type OpsMessage<F extends string> = { field: F; level: "ERROR" | "WARNING"; message: string };
export type OpsCheck<F extends string> = { ok: boolean; messages: OpsMessage<F>[] };
export type OpsGuard = { allowed: boolean; reason: string | null };

const ALLOW: OpsGuard = { allowed: true, reason: null };
const refuse = (reason: string): OpsGuard => ({ allowed: false, reason });

// ───────────────────────────── buses ─────────────────────────────

export type RouteField = "name" | "vehicleNo" | "capacity" | "driverPhone";

export function validateRoute(params: {
  name?: string | null;
  vehicleNo?: string | null;
  capacity?: number | null;
  driverPhone?: string | null;
  existingNames?: string[];
}): OpsCheck<RouteField> {
  const messages: OpsMessage<RouteField>[] = [];
  const name = (params.name ?? "").trim().replace(/\s+/g, " ");

  if (name === "") messages.push({ field: "name", level: "ERROR", message: "Give the route a name, like Kolar Road." });
  else if (name.length > 60) messages.push({ field: "name", level: "ERROR", message: "That route name is too long." });
  else if ((params.existingNames ?? []).some((e) => e.trim().toLowerCase() === name.toLowerCase())) {
    messages.push({ field: "name", level: "ERROR", message: `${name} already exists.` });
  }

  if (params.capacity != null) {
    if (!Number.isInteger(params.capacity) || params.capacity <= 0) {
      messages.push({ field: "capacity", level: "ERROR", message: "A bus seats some whole number of children." });
    } else if (params.capacity > 100) {
      messages.push({ field: "capacity", level: "WARNING", message: "Over a hundred seats — check that is one vehicle." });
    }
  }

  const phone = (params.driverPhone ?? "").replace(/\D/g, "");
  if (phone !== "" && phone.length !== 10) {
    messages.push({ field: "driverPhone", level: "ERROR", message: "An Indian mobile number is 10 digits." });
  }

  const vehicle = (params.vehicleNo ?? "").trim();
  if (vehicle !== "" && vehicle.length < 4) {
    messages.push({ field: "vehicleNo", level: "ERROR", message: "That does not look like a registration number." });
  }

  return { ok: messages.every((m) => m.level !== "ERROR"), messages };
}

/** A route with children on it stays: their fee and their pickup depend on it. */
export function canDeleteRoute(counts: { students: number; stops: number }): OpsGuard {
  if (counts.students > 0) {
    return refuse(
      `${counts.students} ${counts.students === 1 ? "child uses" : "children use"} this route. Move them to another one first.`,
    );
  }
  if (counts.stops > 0) return refuse("Remove this route's stops first.");
  return ALLOW;
}

export function canDeleteStop(counts: { students: number }): OpsGuard {
  if (counts.students > 0) {
    return refuse(
      `${counts.students} ${counts.students === 1 ? "child is" : "children are"} picked up here. Move them to another stop first.`,
    );
  }
  return ALLOW;
}

/**
 * Putting a child on a bus.
 *
 * The seat count is the point: a route quietly over its capacity is a child standing
 * in the aisle, and nobody finds out from a screen.
 */
export function canBoard(params: {
  capacity: number | null;
  onBoard: number;
  studentStatus: string;
  alreadyOnThisRoute: boolean;
}): OpsGuard {
  if (params.studentStatus !== "ACTIVE") return refuse("That child is not on the roll any more.");
  if (params.alreadyOnThisRoute) return refuse("That child already uses this route.");
  if (params.capacity != null && params.onBoard >= params.capacity) {
    return refuse(`This route is full — ${params.onBoard} of ${params.capacity} seats. Put them on another route or add a bus.`);
  }
  return ALLOW;
}

// ───────────────────────────── hostel ─────────────────────────────

export type RoomField = "roomNo" | "capacity" | "kind";

export function validateRoom(params: {
  roomNo?: string | null;
  capacity?: number | null;
  kind?: string | null;
  existingRoomNos?: string[];
}): OpsCheck<RoomField> {
  const messages: OpsMessage<RoomField>[] = [];
  const roomNo = (params.roomNo ?? "").trim().replace(/\s+/g, " ");

  if (roomNo === "") messages.push({ field: "roomNo", level: "ERROR", message: "Give the room a number." });
  else if ((params.existingRoomNos ?? []).some((e) => e.trim().toLowerCase() === roomNo.toLowerCase())) {
    messages.push({ field: "roomNo", level: "ERROR", message: `Room ${roomNo} already exists.` });
  }

  if (params.capacity == null || !Number.isInteger(params.capacity) || params.capacity <= 0) {
    messages.push({ field: "capacity", level: "ERROR", message: "A room sleeps some whole number of children." });
  } else if (params.capacity > 20) {
    messages.push({ field: "capacity", level: "WARNING", message: "Twenty beds in one room — check that is right." });
  }

  if (params.kind && !["BOYS", "GIRLS"].includes(params.kind)) {
    messages.push({ field: "kind", level: "ERROR", message: "A room is for boys or for girls." });
  }

  return { ok: messages.every((m) => m.level !== "ERROR"), messages };
}

export function canDeleteRoom(counts: { allotments: number }): OpsGuard {
  if (counts.allotments > 0) {
    return refuse(
      `${counts.allotments} ${counts.allotments === 1 ? "child has" : "children have"} been in this room. It stays, so the record stays.`,
    );
  }
  return ALLOW;
}

/**
 * Allotting a bed.
 *
 * Capacity is the whole reason a room record exists, and the boys/girls kind is not
 * a label — putting a child in the wrong wing is the sort of mistake a school cannot
 * explain away.
 */
export function canAllot(params: {
  capacity: number;
  occupied: number;
  roomKind: string | null;
  studentGender: string | null;
  studentStatus: string;
  alreadyInARoom: boolean;
}): OpsGuard {
  if (params.studentStatus !== "ACTIVE") return refuse("That child is not on the roll any more.");
  if (params.alreadyInARoom) return refuse("That child already has a bed. Move them rather than allotting a second.");
  if (params.occupied >= params.capacity) {
    return refuse(`This room is full — ${params.occupied} of ${params.capacity} beds.`);
  }
  if (params.roomKind && params.studentGender) {
    const wants = params.roomKind === "BOYS" ? "MALE" : params.roomKind === "GIRLS" ? "FEMALE" : null;
    if (wants && params.studentGender !== wants) {
      return refuse(`That is a ${params.roomKind.toLowerCase()} room.`);
    }
  }
  return ALLOW;
}

// ───────────────────────────── the store cupboard ─────────────────────────────

export type ItemField = "name" | "unit" | "quantity" | "reorderAt" | "unitPrice";

export function validateItem(params: {
  name?: string | null;
  unit?: string | null;
  reorderAt?: number | null;
  unitPricePaise?: number | null;
  existingNames?: string[];
}): OpsCheck<ItemField> {
  const messages: OpsMessage<ItemField>[] = [];
  const name = (params.name ?? "").trim().replace(/\s+/g, " ");

  if (name === "") messages.push({ field: "name", level: "ERROR", message: "Give the item a name." });
  else if ((params.existingNames ?? []).some((e) => e.trim().toLowerCase() === name.toLowerCase())) {
    messages.push({ field: "name", level: "ERROR", message: `${name} is already in the store.` });
  }

  if ((params.unit ?? "").trim() === "") {
    messages.push({ field: "unit", level: "ERROR", message: "Say what it is counted in — pieces, boxes, kilos." });
  }

  if (params.reorderAt != null && (!Number.isInteger(params.reorderAt) || params.reorderAt < 0)) {
    messages.push({ field: "reorderAt", level: "ERROR", message: "A reorder level cannot be negative." });
  }

  if (params.unitPricePaise != null && (!Number.isInteger(params.unitPricePaise) || params.unitPricePaise < 0)) {
    messages.push({ field: "unitPrice", level: "ERROR", message: "A price cannot be negative." });
  }

  return { ok: messages.every((m) => m.level !== "ERROR"), messages };
}

/**
 * What the cupboard holds after a movement.
 *
 * Refuses to issue what is not there, which is the only rule that matters: a store
 * register showing minus four dusters has stopped being a record of anything. An
 * ADJUST is a correction and is allowed to set any non-negative number, because that
 * is what a stock count is for.
 */
export function applyStockTxn(params: {
  kind: "IN" | "OUT" | "ADJUST";
  quantity: number;
  current: number;
}): { allowed: boolean; reason: string | null; next: number } {
  const { kind, quantity, current } = params;

  if (!Number.isInteger(quantity)) {
    return { allowed: false, reason: "A quantity is a whole number.", next: current };
  }

  if (kind === "ADJUST") {
    if (quantity < 0) return { allowed: false, reason: "A count cannot be negative.", next: current };
    return { allowed: true, reason: null, next: quantity };
  }

  if (quantity <= 0) {
    return { allowed: false, reason: "Say how many, more than none.", next: current };
  }

  if (kind === "IN") return { allowed: true, reason: null, next: current + quantity };

  if (quantity > current) {
    return {
      allowed: false,
      reason: `There ${current === 1 ? "is" : "are"} only ${current} left. Count the shelf and adjust it if the register is wrong.`,
      next: current,
    };
  }
  return { allowed: true, reason: null, next: current - quantity };
}

/** Whether an item needs reordering, for a list a storekeeper can act on. */
export function needsReorder(item: { quantity: number; reorderAt: number | null }): boolean {
  return item.reorderAt != null && item.quantity <= item.reorderAt;
}
