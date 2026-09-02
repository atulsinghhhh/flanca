"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, hasRole, requireActor, OFFICE } from "@/lib/session";
import { canPostInThread, canStartThread, readAccess, threadKeyFor } from "@/lib/core/chat-core";
import { getChatPerson } from "@/lib/queries/chat";
import { pushToUser } from "@/lib/push";

/**
 * The school's own chat.
 *
 * Note what is NOT audited: individual messages. Rule 5 read literally would put
 * thousands of rows a day into AuditLog and bury the money and marks trail the
 * audit page exists for. Messages are their own record instead — they cannot be
 * edited or deleted, which is a stronger guarantee than a duplicate audit row.
 * Thread lifecycle (start, close, oversight read, participant added) is audited.
 */

const MAX_BODY = 4000;

export async function startThread(input: {
  targetUserId: string;
  studentId?: string | null;
  body: string;
  subject?: string | null;
  /** The circular this began as a reply to, if it did. */
  originCircularId?: string | null;
}) {
  const actor = await requireActor();

  const body = input.body.trim();
  if (!body) return { error: "Write something first." };
  if (body.length > MAX_BODY) return { error: "That message is too long for one go." };

  const [me, target] = await Promise.all([
    getChatPerson(actor.schoolId, actor.id),
    getChatPerson(actor.schoolId, input.targetUserId),
  ]);
  if (!me) return { error: "Your account is not attached to this school." };
  if (!target) return { error: "That person is not part of this school." };

  const student = input.studentId
    ? await db.student.findFirst({
        where: { id: input.studentId, schoolId: actor.schoolId },
        select: { id: true, schoolId: true, sectionId: true, status: true, name: true },
      })
    : null;
  if (input.studentId && !student) return { error: "That student is not on this school's roll." };

  const verdict = canStartThread({
    initiator: me,
    target,
    student: student
      ? {
          studentId: student.id,
          schoolId: student.schoolId,
          sectionId: student.sectionId,
          isActive: student.status === "ACTIVE",
        }
      : null,
  });
  if (!verdict.allowed) return { error: verdict.reason ?? "You cannot start that conversation." };

  const threadKey = threadKeyFor({
    kind: "DIRECT",
    userIds: [actor.id, input.targetUserId],
    studentId: student?.id ?? null,
  });

  // A conversation already exists for exactly these people about exactly this
  // child: add to it rather than starting a second one. This is the double-tap
  // case as much as the deliberate one.
  const existing = await db.messageThread.findFirst({
    where: { schoolId: actor.schoolId, threadKey },
    select: { id: true },
  });
  if (existing) {
    const posted = await postMessage({ threadId: existing.id, body });
    if ("error" in posted) return posted;
    return { ok: true as const, threadId: existing.id, reused: true };
  }

  const now = new Date();
  const threadId = await db.$transaction(async (tx) => {
    const thread = await tx.messageThread.create({
      data: {
        schoolId: actor.schoolId,
        kind: "DIRECT",
        studentId: student?.id ?? null,
        threadKey,
        subject: input.subject?.trim() || null,
        originCircularId: input.originCircularId ?? null,
        createdByUserId: actor.id,
        lastMessageAt: now,
        lastSenderUserId: actor.id,
        participants: {
          create: [
            { userId: actor.id, lastReadAt: now, unreadCount: 0 },
            { userId: input.targetUserId, unreadCount: 1 },
          ],
        },
      },
      select: { id: true },
    });

    await tx.message.create({ data: { threadId: thread.id, senderUserId: actor.id, body } });
    return thread.id;
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "chat.thread.start",
    entity: "MessageThread",
    entityId: threadId,
    summary: student
      ? `Started a conversation about ${student.name}`
      : "Started a conversation",
  });

  revalidatePath("/app/chat");
  revalidatePath("/app");
  return { ok: true as const, threadId, reused: false };
}

export async function postMessage(input: { threadId: string; body: string }) {
  const actor = await requireActor();

  const body = input.body.trim();
  if (!body) return { error: "Write something first." };
  if (body.length > MAX_BODY) return { error: "That message is too long for one go." };

  const thread = await db.messageThread.findFirst({
    where: { id: input.threadId, schoolId: actor.schoolId },
    include: {
      participants: { select: { userId: true, leftAt: true } },
      student: { select: { status: true } },
    },
  });
  if (!thread) return { error: "That conversation no longer exists." };

  const me = await getChatPerson(actor.schoolId, actor.id);
  if (!me) return { error: "Your account is not attached to this school." };

  const mine = thread.participants.find((p) => p.userId === actor.id);
  const verdict = canPostInThread({
    actor: me,
    thread: {
      threadId: thread.id,
      schoolId: thread.schoolId,
      kind: thread.kind,
      studentId: thread.studentId,
      closedAt: thread.closedAt,
    },
    isParticipant: Boolean(mine),
    hasLeft: Boolean(mine?.leftAt),
    studentIsActive: thread.student ? thread.student.status === "ACTIVE" : undefined,
  });
  if (!verdict.allowed) return { error: verdict.reason ?? "You cannot reply here." };

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.message.create({ data: { threadId: thread.id, senderUserId: actor.id, body } });
    await tx.messageThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: now, lastSenderUserId: actor.id },
    });
    // Everyone else's badge goes up by one; mine stays clear, because I have
    // obviously read my own message.
    await tx.threadParticipant.updateMany({
      where: { threadId: thread.id, userId: { not: actor.id }, leftAt: null },
      data: { unreadCount: { increment: 1 } },
    });
    await tx.threadParticipant.updateMany({
      where: { threadId: thread.id, userId: actor.id },
      data: { lastReadAt: now, unreadCount: 0 },
    });
  });

  // The message is committed; notifying is best-effort after the fact and can
  // never fail the send. Muted participants keep their unread badge and lose only
  // the buzz in their pocket.
  const audience = await db.threadParticipant.findMany({
    where: { threadId: thread.id, userId: { not: actor.id }, leftAt: null, mutedAt: null },
    select: { userId: true },
  });
  const preview = body.length > 120 ? `${body.slice(0, 119)}…` : body;
  await Promise.all(
    audience.map((p) =>
      pushToUser(actor.schoolId, p.userId, {
        title: actor.name || "A message from the school",
        body: preview,
        url: `/app/chat/${thread.id}`,
        tag: `thread-${thread.id}`,
      }),
    ),
  ).catch(() => undefined);

  revalidatePath(`/app/chat/${thread.id}`);
  revalidatePath("/app/chat");
  revalidatePath("/app");
  return { ok: true as const };
}

/**
 * A browser saying "notify me". Stored per device, because a parent has a phone and
 * a laptop and both should buzz.
 */
export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}) {
  const actor = await requireActor();
  if (!input.endpoint || !input.p256dh || !input.auth) {
    return { error: "That browser did not return a usable subscription." };
  }

  await db.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    update: {
      schoolId: actor.schoolId,
      userId: actor.id,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
      lastSeenAt: new Date(),
      lastError: null,
    },
    create: {
      schoolId: actor.schoolId,
      userId: actor.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    },
  });

  return { ok: true as const };
}

/** And the same browser saying "stop". */
export async function removePushSubscription(input: { endpoint: string }) {
  const actor = await requireActor();
  await db.pushSubscription.deleteMany({ where: { endpoint: input.endpoint, userId: actor.id } });
  return { ok: true as const };
}

/** Silence one conversation's notifications without hiding it. */
export async function setThreadMuted(input: { threadId: string; muted: boolean }) {
  const actor = await requireActor();
  const updated = await db.threadParticipant.updateMany({
    where: { threadId: input.threadId, userId: actor.id, thread: { schoolId: actor.schoolId } },
    data: { mutedAt: input.muted ? new Date() : null },
  });
  if (updated.count === 0) return { error: "You are not part of that conversation." };

  revalidatePath(`/app/chat/${input.threadId}`);
  return { ok: true as const };
}

/** Opening a conversation is what marks it read. Safe to call when there is nothing to clear. */
export async function markThreadRead(input: { threadId: string }) {
  const actor = await requireActor();

  const updated = await db.threadParticipant.updateMany({
    where: { threadId: input.threadId, userId: actor.id, thread: { schoolId: actor.schoolId } },
    data: { lastReadAt: new Date(), unreadCount: 0 },
  });
  if (updated.count === 0) return { ok: true as const };

  revalidatePath("/app/chat");
  revalidatePath("/app");
  return { ok: true as const };
}

/**
 * The office opening a conversation it is not part of.
 *
 * This is the answer to "what did the teacher actually say to that parent?", and
 * it is the one place in the product where a READ is audited. Two details make it
 * honest rather than theatrical:
 *
 * The messages come back FROM this action rather than being unlocked by a query
 * parameter. There is therefore nothing to tamper with — no ?open=1 that skips the
 * audit row — and a refresh does not silently re-read, it simply loses the view,
 * which is correct: looking again is a new recorded read.
 *
 * And it never inserts a ThreadParticipant row. If it did, the principal would
 * start counting toward "everyone has read", the conversation would sit in their
 * inbox for ever, and the parent would see them join — which is escalation, not
 * oversight.
 */
export async function openWithOversight(input: { threadId: string }) {
  const actor = await requireActor();

  const [me, thread] = await Promise.all([
    getChatPerson(actor.schoolId, actor.id),
    db.messageThread.findFirst({
      where: { id: input.threadId, schoolId: actor.schoolId },
      include: {
        student: { select: { name: true } },
        participants: { select: { userId: true, leftAt: true, user: { select: { name: true } } } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { sender: { select: { name: true } } },
        },
      },
    }),
  ]);
  if (!me) return { error: "Your account is not attached to this school." };
  if (!thread) return { error: "That conversation no longer exists." };

  const mine = thread.participants.find((p) => p.userId === actor.id);
  const access = readAccess({
    actor: me,
    thread: {
      threadId: thread.id,
      schoolId: thread.schoolId,
      kind: thread.kind,
      studentId: thread.studentId,
      closedAt: thread.closedAt,
    },
    isParticipant: Boolean(mine),
    hasLeft: Boolean(mine?.leftAt),
  });

  if (!access.allowed) return { error: access.reason ?? "This conversation is not yours to read." };
  if (access.mode !== "OVERSIGHT") {
    // A participant does not need this door, and must not be given an audit row
    // that says they exercised oversight over their own conversation.
    return { error: "You are already part of this conversation." };
  }

  const between = thread.participants.map((p) => p.user.name).join(" and ");
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "chat.thread.read",
    entity: "MessageThread",
    entityId: thread.id,
    summary: thread.student
      ? `Read the conversation between ${between} about ${thread.student.name}`
      : `Read the conversation between ${between}`,
  });

  revalidatePath("/app/settings/audit");

  return {
    ok: true as const,
    messages: thread.messages.map((m) => ({
      id: m.id,
      body: m.body,
      senderName: m.sender.name,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/**
 * Closing a conversation, and opening it again.
 *
 * A closed conversation stays readable for ever and leaves everybody's inbox — it
 * is a timestamp, not a delete, so it is reversible and the record survives. This
 * is what a class-teacher handover needs, and what a year rollover will need when
 * it lands: a teacher should not carry five years of other people's families in
 * their inbox.
 */
export async function setThreadClosed(input: { threadId: string; closed: boolean }) {
  const actor = await requireActor();
  if (!hasRole(actor, ...OFFICE)) {
    return { error: "Only the office can close or reopen a conversation." };
  }

  const thread = await db.messageThread.findFirst({
    where: { id: input.threadId, schoolId: actor.schoolId },
    include: { participants: { select: { user: { select: { name: true } } } } },
  });
  if (!thread) return { error: "That conversation no longer exists." };
  if (Boolean(thread.closedAt) === input.closed) {
    return { error: input.closed ? "That conversation is already closed." : "That conversation is already open." };
  }

  await db.messageThread.update({
    where: { id: thread.id },
    data: { closedAt: input.closed ? new Date() : null },
  });

  const between = thread.participants.map((p) => p.user.name).join(" and ");
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: input.closed ? "chat.thread.close" : "chat.thread.reopen",
    entity: "MessageThread",
    entityId: thread.id,
    summary: `${input.closed ? "Closed" : "Reopened"} the conversation between ${between}`,
    before: { closedAt: thread.closedAt },
    after: { closedAt: input.closed ? new Date() : null },
    reversible: true,
  });

  revalidatePath(`/app/chat/${thread.id}`);
  revalidatePath("/app/chat");
  revalidatePath("/app");
  return { ok: true as const };
}
