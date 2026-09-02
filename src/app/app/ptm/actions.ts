"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, hasRole, requireActor, OFFICE } from "@/lib/session";
import { getChatPerson } from "@/lib/queries/chat";
import { hasSlotSameDay } from "@/lib/queries/ptm";
import { schoolToday } from "@/lib/queries/when";
import {
  buildSlots,
  canBookSlot,
  canCancelBooking,
  canOfferSlots,
  canRemoveSlot,
  clockToMinutes,
  minutesToClock,
} from "@/lib/core/ptm-core";
import { pushToUser } from "@/lib/push";

const asDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function reach(actor: { schoolId: string; id: string }) {
  const person = await getChatPerson(actor.schoolId, actor.id);
  const isOffice = Boolean(person?.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r)));
  return { person, isOffice };
}

/**
 * Opening slots. A teacher offers them under their own name; the office,
 * which usually has no subject of its own, offers them under the section's
 * class teacher — a family should never see "slots with the office" on a
 * PTM list.
 */
export async function generateSlots(input: {
  sectionId: string;
  dateIso: string;
  startClock: string;
  endClock: string;
  durationMinutes: number;
  note?: string | null;
}) {
  const actor = await requireActor();
  const { person, isOffice } = await reach(actor);
  if (!person) return { error: "You do not have a role at this school." };

  const section = await db.section.findFirst({
    where: { id: input.sectionId, schoolId: actor.schoolId },
    select: { id: true, name: true, classTeacherId: true, class: { select: { name: true } } },
  });
  if (!section) return { error: "That section is not in this school." };

  const guard = canOfferSlots({
    roles: person.roles,
    classTeacherOfSectionIds: person.classTeacherOfSectionIds,
    teachesSectionIds: person.teachesSectionIds,
    sectionId: section.id,
    isActiveStaff: person.isActiveStaff || isOffice,
  });
  if (!guard.allowed) return { error: guard.reason! };

  // The office acts on the section's behalf, not its own — a principal who is
  // also, separately, on the payroll must not have PTM slots default to
  // herself just because she happens to have a staffId. A teacher generating
  // for their own section always uses their own.
  let staffId = isOffice ? null : person.staffId;
  if (!staffId) {
    if (!section.classTeacherId) return { error: "This section has no class teacher assigned yet." };
    const classTeacherStaff = await db.staff.findFirst({
      where: { schoolId: actor.schoolId, userId: section.classTeacherId },
      select: { id: true },
    });
    if (!classTeacherStaff) return { error: "The class teacher has no staff record to offer slots under." };
    staffId = classTeacherStaff.id;
  }

  const date = asDate(input.dateIso);
  if (Number.isNaN(date.getTime())) return { error: "That is not a date." };
  if (date.getTime() < schoolToday().getTime()) return { error: "That date has already passed." };

  const startMinute = clockToMinutes(input.startClock);
  const endMinute = clockToMinutes(input.endClock);
  if (startMinute == null || endMinute == null) return { error: "Those times do not look right." };

  const { slots, error } = buildSlots({ startMinute, endMinute, durationMinutes: input.durationMinutes });
  if (error) return { error };

  const made = await db.pTMSlot.createMany({
    data: slots.map((s) => ({
      schoolId: actor.schoolId,
      staffId: staffId as string,
      sectionId: section.id,
      date,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      note: input.note?.trim() || null,
    })),
    skipDuplicates: true,
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "ptm.slots.open",
    entity: "PTMSlot",
    summary: `Opened ${made.count} PTM slot${made.count === 1 ? "" : "s"} for ${section.class?.name ?? ""} ${section.name} on ${input.dateIso}, ${minutesToClock(startMinute)}–${minutesToClock(endMinute)}`,
  });

  if (made.count > 0) {
    const parents = await db.parentLink.findMany({
      where: { schoolId: actor.schoolId, student: { sectionId: section.id, status: "ACTIVE" } },
      select: { userId: true },
      distinct: ["userId"],
    });
    if (parents.length > 0) {
      await db.notification.createMany({
        data: parents.map((p) => ({
          schoolId: actor.schoolId,
          userId: p.userId,
          kind: "PTM",
          title: "New meeting slots open",
          body: `${made.count} slot${made.count === 1 ? "" : "s"} for ${section.class?.name ?? ""} ${section.name} on ${input.dateIso}`,
          linkUrl: "/app/ptm",
        })),
        skipDuplicates: true,
      });
      await Promise.all(
        parents.map((p) =>
          pushToUser(actor.schoolId, p.userId, {
            title: "New PTM slots open",
            body: `${section.class?.name ?? ""} ${section.name}, ${input.dateIso}`,
            url: "/app/ptm",
            tag: `ptm-${section.id}-${input.dateIso}`,
          }),
        ),
      ).catch(() => undefined);
    }
  }

  revalidatePath("/app/ptm");
  return { ok: true as const, created: made.count };
}

export async function removeSlot(input: { slotId: string }) {
  const actor = await requireActor();
  const { person, isOffice } = await reach(actor);
  if (!person) return { error: "You do not have a role at this school." };

  const slot = await db.pTMSlot.findFirst({
    where: { id: input.slotId, schoolId: actor.schoolId },
    select: { id: true, sectionId: true, bookedAt: true },
  });
  if (!slot) return { error: "That slot is not in this school." };

  const guard = canOfferSlots({
    roles: person.roles,
    classTeacherOfSectionIds: person.classTeacherOfSectionIds,
    teachesSectionIds: person.teachesSectionIds,
    sectionId: slot.sectionId,
    isActiveStaff: person.isActiveStaff || isOffice,
  });
  if (!guard.allowed) return { error: guard.reason! };

  const canGo = canRemoveSlot({ isBooked: Boolean(slot.bookedAt) });
  if (!canGo.allowed) return { error: canGo.reason! };

  await db.pTMSlot.delete({ where: { id: slot.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "ptm.slot.remove",
    entity: "PTMSlot",
    entityId: slot.id,
    summary: "Removed an unbooked PTM slot",
  });

  revalidatePath("/app/ptm");
  return { ok: true as const };
}

/** A parent booking one slot for one of their own children. */
export async function bookSlot(input: { slotId: string; studentId: string }) {
  const actor = await requireActor();

  const slot = await db.pTMSlot.findFirst({
    where: { id: input.slotId, schoolId: actor.schoolId },
    include: { staff: { select: { id: true, userId: true, user: { select: { name: true } } } }, section: { select: { name: true, class: { select: { name: true } } } } },
  });
  if (!slot) return { error: "That slot is not in this school." };

  const link = await db.parentLink.findFirst({
    where: { schoolId: actor.schoolId, userId: actor.id, studentId: input.studentId },
    select: { student: { select: { id: true, name: true, sectionId: true } } },
  });
  if (!link) return { error: "That is not your child." };

  const sameDay = await hasSlotSameDay(slot.staffId, slot.date, actor.id);
  const guard = canBookSlot({
    alreadyBooked: Boolean(slot.bookedAt),
    studentSectionId: link.student.sectionId,
    slotSectionId: slot.sectionId,
    parentHasAnotherSlotSameDayWithStaff: sameDay,
  });
  if (!guard.allowed) return { error: guard.reason! };

  await db.pTMSlot.update({
    where: { id: slot.id },
    data: { studentId: link.student.id, bookedByUserId: actor.id, bookedAt: new Date() },
  });

  const dateIso = slot.date.toISOString().slice(0, 10);
  const when = `${minutesToClock(slot.startMinute)}–${minutesToClock(slot.endMinute)}`;

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "ptm.slot.book",
    entity: "PTMSlot",
    entityId: slot.id,
    summary: `Booked ${dateIso} ${when} with ${slot.staff.user.name} for ${link.student.name}`,
  });

  await db.notification.create({
    data: {
      schoolId: actor.schoolId,
      userId: slot.staff.userId,
      kind: "PTM",
      title: "Meeting slot booked",
      body: `${link.student.name}'s parent booked ${dateIso} ${when}`,
      linkUrl: "/app/ptm",
    },
  });
  await pushToUser(actor.schoolId, slot.staff.userId, {
    title: "Meeting slot booked",
    body: `${link.student.name}, ${dateIso} ${when}`,
    url: "/app/ptm",
    tag: `ptm-${slot.id}`,
  }).catch(() => undefined);

  revalidatePath("/app/ptm");
  return { ok: true as const };
}

export async function cancelBooking(input: { slotId: string }) {
  const actor = await requireActor();

  const slot = await db.pTMSlot.findFirst({
    where: { id: input.slotId, schoolId: actor.schoolId },
    include: {
      staff: { select: { userId: true, user: { select: { name: true } } } },
      student: { select: { name: true } },
    },
  });
  if (!slot) return { error: "That slot is not in this school." };
  if (!slot.bookedAt) return { error: "Nothing is booked in this slot." };

  const guard = canCancelBooking({
    isOffice: hasRole(actor, ...OFFICE),
    isBookingParent: slot.bookedByUserId === actor.id,
    isSlotOwner: slot.staff.userId === actor.id,
  });
  if (!guard.allowed) return { error: guard.reason! };

  const cancelledParentId = slot.bookedByUserId;
  const studentName = slot.student?.name ?? "the child";
  const dateIso = slot.date.toISOString().slice(0, 10);
  const when = `${minutesToClock(slot.startMinute)}–${minutesToClock(slot.endMinute)}`;

  await db.pTMSlot.update({
    where: { id: slot.id },
    data: { studentId: null, bookedByUserId: null, bookedAt: null },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "ptm.slot.cancel",
    entity: "PTMSlot",
    entityId: slot.id,
    summary: `Cancelled the ${dateIso} ${when} booking for ${studentName}`,
    reversible: true,
  });

  // Tell whichever side did not do the cancelling.
  const notifyUserId = actor.id === cancelledParentId ? slot.staff.userId : cancelledParentId;
  if (notifyUserId) {
    await db.notification.create({
      data: {
        schoolId: actor.schoolId,
        userId: notifyUserId,
        kind: "PTM",
        title: "Meeting slot cancelled",
        body: `${dateIso} ${when} for ${studentName} is free again`,
        linkUrl: "/app/ptm",
      },
    });
    await pushToUser(actor.schoolId, notifyUserId, {
      title: "Meeting slot cancelled",
      body: `${dateIso} ${when} for ${studentName}`,
      url: "/app/ptm",
      tag: `ptm-${slot.id}`,
    }).catch(() => undefined);
  }

  revalidatePath("/app/ptm");
  return { ok: true as const };
}
