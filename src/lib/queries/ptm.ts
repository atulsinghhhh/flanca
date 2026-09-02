import { db } from "@/lib/db";

/**
 * A teacher's (or the office's, viewing one section's) own PTM slots, soonest
 * first, with who booked each one. Past slots are excluded — nobody needs to
 * see last month's empty afternoon.
 */
export async function getSlotsForSection(schoolId: string, sectionId: string, fromDate: Date) {
  return db.pTMSlot.findMany({
    where: { schoolId, sectionId, date: { gte: fromDate } },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
    include: {
      staff: { include: { user: { select: { name: true } } } },
      student: { select: { id: true, name: true } },
      bookedBy: { select: { name: true } },
    },
  });
}

/** The slots a parent's own child may book — their class teacher's section, soonest first. */
export async function getBookableSlotsForSection(schoolId: string, sectionId: string, fromDate: Date) {
  return db.pTMSlot.findMany({
    where: { schoolId, sectionId, date: { gte: fromDate } },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
    include: {
      staff: { include: { user: { select: { name: true } } } },
      student: { select: { id: true, name: true } },
    },
  });
}

/** Whether this parent already holds a slot with this staff member on this date. */
export async function hasSlotSameDay(staffId: string, date: Date, bookedByUserId: string) {
  const existing = await db.pTMSlot.findFirst({
    where: { staffId, date, bookedByUserId },
    select: { id: true },
  });
  return Boolean(existing);
}
