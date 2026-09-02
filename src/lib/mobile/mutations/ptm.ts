import { db } from "@/lib/db";
import { audit, hasRole, OFFICE, type Actor } from "@/lib/session";
import { getChatPerson } from "@/lib/queries/chat";
import { hasSlotSameDay } from "@/lib/queries/ptm";
import { schoolToday } from "@/lib/queries/when";
import {
  buildSlots,
  canBookSlot,
  canCancelBooking,
  canOfferSlots,
  canRemoveSlot,
  minutesToClock,
  clockToMinutes,
} from "@/lib/core/ptm-core";
import { pushToUser } from "@/lib/push";

const asDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

/**
 * The mobile-API twin of src/app/app/ptm/actions.ts::reach — resolves the same
 * "who is this person, for this school" facts chat-core (and ptm-core) needs.
 */
async function reach(actor: { schoolId: string; id: string }) {
  const person = await getChatPerson(actor.schoolId, actor.id);
  const isOffice = Boolean(person?.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r)));
  return { person, isOffice };
}

export type GenerateSlotsInput = {
  sectionId: string;
  dateIso: string;
  startClock: string;
  endClock: string;
  durationMinutes: number;
  note?: string | null;
};

export type PtmMutationResult<T extends object = Record<string, unknown>> =
  | { ok: false; status: number; code: string; message: string }
  | ({ ok: true } & T);

/**
 * The mobile-API twin of src/app/app/ptm/actions.ts::generateSlots — same
 * reach/guard checks, same notify+push fan-out, minus the `revalidatePath`
 * (no page cache to invalidate for a stateless JSON client).
 */
export async function generateSlotsForActor(
  actor: Actor,
  input: GenerateSlotsInput,
): Promise<PtmMutationResult<{ created: number }>> {
  const { person, isOffice } = await reach(actor);
  if (!person) return { ok: false, status: 403, code: "forbidden", message: "You do not have a role at this school." };

  const section = await db.section.findFirst({
    where: { id: input.sectionId, schoolId: actor.schoolId },
    select: { id: true, name: true, classTeacherId: true, class: { select: { name: true } } },
  });
  if (!section) return { ok: false, status: 404, code: "not_found", message: "That section is not in this school." };

  const guard = canOfferSlots({
    roles: person.roles,
    classTeacherOfSectionIds: person.classTeacherOfSectionIds,
    teachesSectionIds: person.teachesSectionIds,
    sectionId: section.id,
    isActiveStaff: person.isActiveStaff || isOffice,
  });
  if (!guard.allowed) return { ok: false, status: 403, code: "forbidden", message: guard.reason! };

  // The office acts on the section's behalf, not its own — a principal who is
  // also, separately, on the payroll must not have PTM slots default to
  // herself just because she happens to have a staffId. A teacher generating
  // for their own section always uses their own.
  let staffId = isOffice ? null : person.staffId;
  if (!staffId) {
    if (!section.classTeacherId) {
      return { ok: false, status: 422, code: "no_class_teacher", message: "This section has no class teacher assigned yet." };
    }
    const classTeacherStaff = await db.staff.findFirst({
      where: { schoolId: actor.schoolId, userId: section.classTeacherId },
      select: { id: true },
    });
    if (!classTeacherStaff) {
      return { ok: false, status: 422, code: "no_staff_record", message: "The class teacher has no staff record to offer slots under." };
    }
    staffId = classTeacherStaff.id;
  }

  const date = asDate(input.dateIso);
  if (Number.isNaN(date.getTime())) return { ok: false, status: 422, code: "invalid_date", message: "That is not a date." };
  if (date.getTime() < schoolToday().getTime()) {
    return { ok: false, status: 422, code: "date_passed", message: "That date has already passed." };
  }

  const startMinute = clockToMinutes(input.startClock);
  const endMinute = clockToMinutes(input.endClock);
  if (startMinute == null || endMinute == null) {
    return { ok: false, status: 422, code: "invalid_time", message: "Those times do not look right." };
  }

  const { slots, error } = buildSlots({ startMinute, endMinute, durationMinutes: input.durationMinutes });
  if (error) return { ok: false, status: 422, code: "invalid_slots", message: error };

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

  return { ok: true, created: made.count };
}

/** The mobile-API twin of src/app/app/ptm/actions.ts::removeSlot. */
export async function removeSlotForActor(actor: Actor, input: { slotId: string }): Promise<PtmMutationResult> {
  const { person, isOffice } = await reach(actor);
  if (!person) return { ok: false, status: 403, code: "forbidden", message: "You do not have a role at this school." };

  const slot = await db.pTMSlot.findFirst({
    where: { id: input.slotId, schoolId: actor.schoolId },
    select: { id: true, sectionId: true, bookedAt: true },
  });
  if (!slot) return { ok: false, status: 404, code: "not_found", message: "That slot is not in this school." };

  const guard = canOfferSlots({
    roles: person.roles,
    classTeacherOfSectionIds: person.classTeacherOfSectionIds,
    teachesSectionIds: person.teachesSectionIds,
    sectionId: slot.sectionId,
    isActiveStaff: person.isActiveStaff || isOffice,
  });
  if (!guard.allowed) return { ok: false, status: 403, code: "forbidden", message: guard.reason! };

  const canGo = canRemoveSlot({ isBooked: Boolean(slot.bookedAt) });
  if (!canGo.allowed) return { ok: false, status: 409, code: "slot_booked", message: canGo.reason! };

  await db.pTMSlot.delete({ where: { id: slot.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "ptm.slot.remove",
    entity: "PTMSlot",
    entityId: slot.id,
    summary: "Removed an unbooked PTM slot",
  });

  return { ok: true };
}

/** The mobile-API twin of src/app/app/ptm/actions.ts::bookSlot — a parent booking one slot for one of their own children. */
export async function bookSlotForActor(
  actor: Actor,
  input: { slotId: string; studentId: string },
): Promise<PtmMutationResult> {
  const slot = await db.pTMSlot.findFirst({
    where: { id: input.slotId, schoolId: actor.schoolId },
    include: {
      staff: { select: { id: true, userId: true, user: { select: { name: true } } } },
      section: { select: { name: true, class: { select: { name: true } } } },
    },
  });
  if (!slot) return { ok: false, status: 404, code: "not_found", message: "That slot is not in this school." };

  const link = await db.parentLink.findFirst({
    where: { schoolId: actor.schoolId, userId: actor.id, studentId: input.studentId },
    select: { student: { select: { id: true, name: true, sectionId: true } } },
  });
  if (!link) return { ok: false, status: 403, code: "forbidden", message: "That is not your child." };

  const sameDay = await hasSlotSameDay(slot.staffId, slot.date, actor.id);
  const guard = canBookSlot({
    alreadyBooked: Boolean(slot.bookedAt),
    studentSectionId: link.student.sectionId,
    slotSectionId: slot.sectionId,
    parentHasAnotherSlotSameDayWithStaff: sameDay,
  });
  if (!guard.allowed) {
    // Same precedence canBookSlot itself checks in, just mapped to an HTTP status/code.
    if (slot.bookedAt) return { ok: false, status: 409, code: "slot_taken", message: guard.reason! };
    if (link.student.sectionId !== slot.sectionId) return { ok: false, status: 403, code: "wrong_section", message: guard.reason! };
    return { ok: false, status: 409, code: "same_day_conflict", message: guard.reason! };
  }

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

  return { ok: true };
}

/** The mobile-API twin of src/app/app/ptm/actions.ts::cancelBooking. */
export async function cancelBookingForActor(actor: Actor, input: { slotId: string }): Promise<PtmMutationResult> {
  const slot = await db.pTMSlot.findFirst({
    where: { id: input.slotId, schoolId: actor.schoolId },
    include: {
      staff: { select: { userId: true, user: { select: { name: true } } } },
      student: { select: { name: true } },
    },
  });
  if (!slot) return { ok: false, status: 404, code: "not_found", message: "That slot is not in this school." };
  if (!slot.bookedAt) return { ok: false, status: 422, code: "not_booked", message: "Nothing is booked in this slot." };

  const guard = canCancelBooking({
    isOffice: hasRole(actor, ...OFFICE),
    isBookingParent: slot.bookedByUserId === actor.id,
    isSlotOwner: slot.staff.userId === actor.id,
  });
  if (!guard.allowed) return { ok: false, status: 403, code: "forbidden", message: guard.reason! };

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

  return { ok: true };
}
