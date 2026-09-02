/**
 * Parent-teacher meeting slots. Pure.
 *
 * A teacher offers a block of time cut into fixed-size slots; a parent of a
 * child in that section books one. Who may offer slots for a section is the
 * same reach chat and homework use, and for the same reason — TimetableEntry
 * and Section.classTeacherId are the only things that say who actually stands
 * in front of a class, not a role by itself.
 */

export type PtmGuard = { allowed: boolean; reason: string | null };
export type PtmSlotTime = { startMinute: number; endMinute: number };

const MIN_DURATION = 5;
const MAX_SPAN_MINUTES = 8 * 60; // a school day, generously

/** "HH:MM" from minutes since midnight. */
export function minutesToClock(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Minutes since midnight from "HH:MM", or null if it does not parse. */
export function clockToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mins = Number(m[2]);
  if (h < 0 || h > 23 || mins < 0 || mins > 59) return null;
  return h * 60 + mins;
}

/**
 * Cut a time range into fixed-size slots. The remainder, if the range does
 * not divide evenly, is dropped rather than handed out as a short slot nobody
 * asked for — a 10-minute leftover at the end of a 15-minute-slot afternoon is
 * not a meeting anybody can hold.
 */
export function buildSlots(params: {
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
}): { slots: PtmSlotTime[]; error: string | null } {
  const { startMinute, endMinute, durationMinutes } = params;

  if (!Number.isInteger(durationMinutes) || durationMinutes < MIN_DURATION) {
    return { slots: [], error: `Each slot needs to be at least ${MIN_DURATION} minutes.` };
  }
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute) || endMinute <= startMinute) {
    return { slots: [], error: "The end time must be after the start time." };
  }
  if (endMinute - startMinute > MAX_SPAN_MINUTES) {
    return { slots: [], error: "That is more than one day of slots — split it up." };
  }

  const slots: PtmSlotTime[] = [];
  for (let t = startMinute; t + durationMinutes <= endMinute; t += durationMinutes) {
    slots.push({ startMinute: t, endMinute: t + durationMinutes });
  }
  if (slots.length === 0) {
    return { slots: [], error: "That range is too short for even one slot of that length." };
  }
  return { slots, error: null };
}

/** Whether this person may offer PTM slots for this section — the office may for any. */
export function canOfferSlots(params: {
  roles: string[];
  classTeacherOfSectionIds: string[];
  teachesSectionIds: string[];
  sectionId: string;
  isActiveStaff: boolean;
}): PtmGuard {
  if (params.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r))) {
    return { allowed: true, reason: null };
  }
  if (!params.roles.includes("TEACHER")) {
    return { allowed: false, reason: "Only a teacher or the office can open slots." };
  }
  if (!params.isActiveStaff) {
    return { allowed: false, reason: "That member of staff has left the school." };
  }
  if (
    !params.classTeacherOfSectionIds.includes(params.sectionId) &&
    !params.teachesSectionIds.includes(params.sectionId)
  ) {
    return { allowed: false, reason: "You do not teach that section." };
  }
  return { allowed: true, reason: null };
}

/** A slot with nobody in it may be removed; one with a family booked in must be freed first. */
export function canRemoveSlot(params: { isBooked: boolean }): PtmGuard {
  if (params.isBooked) {
    return { allowed: false, reason: "A family has booked this slot. Cancel the booking first." };
  }
  return { allowed: true, reason: null };
}

/** Whether a parent may book this slot for this child. */
export function canBookSlot(params: {
  alreadyBooked: boolean;
  studentSectionId: string | null;
  slotSectionId: string;
  parentHasAnotherSlotSameDayWithStaff: boolean;
}): PtmGuard {
  if (params.alreadyBooked) return { allowed: false, reason: "Somebody has already booked this slot." };
  if (params.studentSectionId !== params.slotSectionId) {
    return { allowed: false, reason: "This is not your child's section." };
  }
  if (params.parentHasAnotherSlotSameDayWithStaff) {
    return { allowed: false, reason: "You already have a slot with this teacher that day." };
  }
  return { allowed: true, reason: null };
}

/** The parent who booked it, the teacher whose slot it is, or the office may cancel. */
export function canCancelBooking(params: {
  isOffice: boolean;
  isBookingParent: boolean;
  isSlotOwner: boolean;
}): PtmGuard {
  if (params.isOffice || params.isBookingParent || params.isSlotOwner) {
    return { allowed: true, reason: null };
  }
  return { allowed: false, reason: "This is not your booking to cancel." };
}
