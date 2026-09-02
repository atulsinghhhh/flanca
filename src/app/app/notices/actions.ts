"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import type { MessageChannel } from "@prisma/client";

export type Audience = "ALL" | "PARENTS" | "TEACHERS" | "STUDENTS" | "STAFF" | string;

/**
 * Publish a circular.
 *
 * In-app delivery is free and instant. WhatsApp and SMS cost real money per
 * message, so the cost is stated before sending and logged after — a school
 * should never discover its comms spend at the end of the month.
 */
export async function publishCircular(input: {
  title: string;
  body: string;
  audience: Audience;
  isPublic?: boolean;
  channels: MessageChannel[];
}) {
  const actor = await requireRole(...OFFICE);

  if (!input.title.trim()) return { error: "Give the circular a title." };
  if (!input.body.trim()) return { error: "A circular needs a body." };

  const circular = await db.circular.create({
    data: {
      schoolId: actor.schoolId,
      title: input.title.trim(),
      body: input.body.trim(),
      audience: input.audience,
      isPublic: input.isPublic ?? false,
      publishedAt: new Date(),
      createdBy: actor.id,
    },
  });

  const recipients = await resolveRecipients(actor.schoolId, input.audience);

  // In-app notifications for everyone who has a login.
  if (input.channels.includes("IN_APP") && recipients.userIds.length > 0) {
    await db.notification.createMany({
      data: recipients.userIds.map((userId) => ({
        schoolId: actor.schoolId,
        userId,
        kind: "CIRCULAR",
        title: input.title.trim(),
        body: input.body.trim().slice(0, 280),
        linkUrl: `/app/notices`,
      })),
      skipDuplicates: true,
    });
  }

  // Paid channels: one log row each, with its cost, queued rather than claimed
  // as delivered — nothing is marked sent that a provider has not accepted.
  let queued = 0;
  let costPaise = 0;

  for (const channel of input.channels) {
    if (channel === "IN_APP") continue;
    const unit = channel === "WHATSAPP" ? 25 : 18;

    for (const phone of recipients.phones) {
      await db.messageLog.create({
        data: {
          schoolId: actor.schoolId,
          channel,
          recipient: phone,
          template: "circular",
          body: `${input.title.trim()} — ${input.body.trim().slice(0, 160)}`,
          status: "QUEUED",
          costPaise: unit,
        },
      });
      queued++;
      costPaise += unit;
    }
  }

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "circular.publish",
    entity: "Circular",
    entityId: circular.id,
    summary: `Published "${input.title.trim()}" to ${input.audience.toLowerCase()} — ${recipients.userIds.length} in-app${queued ? `, ${queued} messages queued` : ""}`,
  });

  revalidatePath("/app/notices");
  revalidatePath("/app");
  return {
    ok: true,
    inApp: recipients.userIds.length,
    queued,
    costPaise,
    noPhone: recipients.missingPhone,
  };
}

export async function unpublishCircular(circularId: string) {
  const actor = await requireRole(...OFFICE);

  const circular = await db.circular.findFirst({
    where: { id: circularId, schoolId: actor.schoolId },
  });
  if (!circular) return { error: "That circular no longer exists." };

  await db.circular.update({ where: { id: circular.id }, data: { publishedAt: null } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "circular.unpublish",
    entity: "Circular",
    entityId: circular.id,
    summary: `Withdrew "${circular.title}" — messages already sent cannot be recalled`,
  });

  revalidatePath("/app/notices");
  return { ok: true };
}

/** Add a date to the school calendar. Parents see anything marked public. */
export async function addCalendarEvent(input: {
  title: string;
  kind: string;
  startDate: string;
  endDate?: string;
  details?: string;
  isPublic?: boolean;
}) {
  const actor = await requireRole(...OFFICE);
  if (!input.title.trim()) return { error: "Give the event a name." };

  const start = new Date(`${input.startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return { error: "That start date is not valid." };

  const end = input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null;
  if (end && Number.isNaN(end.getTime())) return { error: "That end date is not valid." };
  if (end && end < start) return { error: "The end date cannot be before the start date." };

  const event = await db.calendarEvent.create({
    data: {
      schoolId: actor.schoolId,
      title: input.title.trim(),
      kind: input.kind,
      startDate: start,
      endDate: end,
      details: input.details?.trim() || null,
      isPublic: input.isPublic ?? true,
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "calendar.add",
    entity: "CalendarEvent",
    entityId: event.id,
    summary: `Added "${input.title.trim()}" to the calendar on ${input.startDate}`,
  });

  revalidatePath("/app/calendar");
  revalidatePath("/app");
  revalidatePath("/app/attendance");
  return { ok: true };
}

export async function deleteCalendarEvent(eventId: string) {
  const actor = await requireRole(...OFFICE);
  const event = await db.calendarEvent.findFirst({
    where: { id: eventId, schoolId: actor.schoolId },
  });
  if (!event) return { error: "That event no longer exists." };

  await db.calendarEvent.delete({ where: { id: event.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "calendar.delete",
    entity: "CalendarEvent",
    entityId: event.id,
    summary: `Removed "${event.title}" from the calendar`,
  });

  revalidatePath("/app/calendar");
  return { ok: true };
}

/** Who a given audience actually resolves to, and who we cannot reach. */
async function resolveRecipients(schoolId: string, audience: Audience) {
  if (audience.startsWith("CLASS:")) {
    const classId = audience.slice(6);
    const students = await db.student.findMany({
      where: { schoolId, classId, status: "ACTIVE" },
      select: { guardianPhone: true, parentLinks: { select: { userId: true } } },
    });
    return {
      userIds: students.flatMap((s) => s.parentLinks.map((p) => p.userId)),
      phones: students.map((s) => s.guardianPhone).filter((p): p is string => Boolean(p)),
      missingPhone: students.filter((s) => !s.guardianPhone).length,
    };
  }

  if (audience === "TEACHERS" || audience === "STAFF") {
    const staff = await db.staff.findMany({
      where: { schoolId, isActive: true, ...(audience === "TEACHERS" ? { department: "Academics" } : {}) },
      select: { userId: true, phone: true },
    });
    return {
      userIds: staff.map((s) => s.userId),
      phones: staff.map((s) => s.phone).filter((p): p is string => Boolean(p)),
      missingPhone: staff.filter((s) => !s.phone).length,
    };
  }

  const students = await db.student.findMany({
    where: { schoolId, status: "ACTIVE" },
    select: { userId: true, guardianPhone: true, parentLinks: { select: { userId: true } } },
  });

  const parentUserIds = students.flatMap((s) => s.parentLinks.map((p) => p.userId));
  const studentUserIds = students.map((s) => s.userId).filter((id): id is string => Boolean(id));

  if (audience === "STUDENTS") {
    return { userIds: studentUserIds, phones: [], missingPhone: 0 };
  }

  const phones = students.map((s) => s.guardianPhone).filter((p): p is string => Boolean(p));

  if (audience === "PARENTS") {
    return {
      userIds: parentUserIds,
      phones,
      missingPhone: students.filter((s) => !s.guardianPhone).length,
    };
  }

  // ALL
  const staff = await db.staff.findMany({
    where: { schoolId, isActive: true },
    select: { userId: true, phone: true },
  });

  return {
    userIds: [...new Set([...parentUserIds, ...studentUserIds, ...staff.map((s) => s.userId)])],
    phones: [...phones, ...staff.map((s) => s.phone).filter((p): p is string => Boolean(p))],
    missingPhone: students.filter((s) => !s.guardianPhone).length,
  };
}
