import { db } from "@/lib/db";
import { audit, hasRole, OFFICE, type Actor } from "@/lib/session";
import { canPostInThread, canStartThread, readAccess, threadKeyFor } from "@/lib/core/chat-core";
import { getChatPerson } from "@/lib/queries/chat";
import { pushToUser } from "@/lib/push";

/**
 * The mobile-API twin of src/app/app/chat/actions.ts — same reach rules, same
 * side effects (unread bumps, best-effort push, audited thread lifecycle), just
 * taking `actor` as a parameter instead of resolving it from a cookie session.
 *
 * `revalidatePath` is dropped throughout: that call invalidates the *web app's*
 * Next.js page cache, which a mobile JSON client never renders.
 */

const MAX_BODY = 4000;

type Failure = { ok: false; status: number; code: string; message: string };

export type StartThreadInput = {
  targetUserId: string;
  studentId?: string | null;
  body: string;
  subject?: string | null;
  originCircularId?: string | null;
};

export type StartThreadResult = Failure | { ok: true; threadId: string; reused: boolean };

export async function startThreadForActor(actor: Actor, input: StartThreadInput): Promise<StartThreadResult> {
  const body = input.body.trim();
  if (!body) return { ok: false, status: 422, code: "empty_body", message: "Write something first." };
  if (body.length > MAX_BODY) {
    return { ok: false, status: 422, code: "body_too_long", message: "That message is too long for one go." };
  }

  const [me, target] = await Promise.all([
    getChatPerson(actor.schoolId, actor.id),
    getChatPerson(actor.schoolId, input.targetUserId),
  ]);
  if (!me) return { ok: false, status: 403, code: "forbidden", message: "Your account is not attached to this school." };
  if (!target) return { ok: false, status: 404, code: "not_found", message: "That person is not part of this school." };

  const student = input.studentId
    ? await db.student.findFirst({
        where: { id: input.studentId, schoolId: actor.schoolId },
        select: { id: true, schoolId: true, sectionId: true, status: true, name: true },
      })
    : null;
  if (input.studentId && !student) {
    return { ok: false, status: 404, code: "not_found", message: "That student is not on this school's roll." };
  }

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
  if (!verdict.allowed) {
    return { ok: false, status: 403, code: "forbidden", message: verdict.reason ?? "You cannot start that conversation." };
  }

  const threadKey = threadKeyFor({
    kind: "DIRECT",
    userIds: [actor.id, input.targetUserId],
    studentId: student?.id ?? null,
  });

  // A conversation already exists for exactly these people about exactly this
  // child: add to it rather than starting a second one.
  const existing = await db.messageThread.findFirst({
    where: { schoolId: actor.schoolId, threadKey },
    select: { id: true },
  });
  if (existing) {
    const posted = await postMessageForActor(actor, { threadId: existing.id, body });
    if (!posted.ok) return posted;
    return { ok: true, threadId: existing.id, reused: true };
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
    summary: student ? `Started a conversation about ${student.name}` : "Started a conversation",
  });

  return { ok: true, threadId, reused: false };
}

export type PostMessageInput = { threadId: string; body: string };
export type PostMessageResult = Failure | { ok: true };

export async function postMessageForActor(actor: Actor, input: PostMessageInput): Promise<PostMessageResult> {
  const body = input.body.trim();
  if (!body) return { ok: false, status: 422, code: "empty_body", message: "Write something first." };
  if (body.length > MAX_BODY) {
    return { ok: false, status: 422, code: "body_too_long", message: "That message is too long for one go." };
  }

  const thread = await db.messageThread.findFirst({
    where: { id: input.threadId, schoolId: actor.schoolId },
    include: {
      participants: { select: { userId: true, leftAt: true } },
      student: { select: { status: true } },
    },
  });
  if (!thread) return { ok: false, status: 404, code: "not_found", message: "That conversation no longer exists." };

  const me = await getChatPerson(actor.schoolId, actor.id);
  if (!me) return { ok: false, status: 403, code: "forbidden", message: "Your account is not attached to this school." };

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
  if (!verdict.allowed) {
    return { ok: false, status: 403, code: "forbidden", message: verdict.reason ?? "You cannot reply here." };
  }

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
  // the buzz in their pocket. Targets the *other* participant's registered
  // web-push subscriptions — harmless to also fire for a mobile-originated send.
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

  return { ok: true };
}

/**
 * The current roster for one section's class channel: every ACTIVE student
 * with a login, plus the class teacher. Recomputed on every call rather than
 * cached on the thread — a transfer or a new admission must show up without
 * a separate sync step, and there is no "leftAt" story to get wrong here the
 * way there would be if membership were captured once at creation.
 */
async function classGroupMembers(schoolId: string, sectionId: string) {
  const [students, section] = await Promise.all([
    db.student.findMany({
      where: { schoolId, sectionId, status: "ACTIVE", userId: { not: null } },
      select: { userId: true },
    }),
    db.section.findFirst({ where: { id: sectionId, schoolId }, select: { classTeacherId: true } }),
  ]);
  const ids = new Set(students.map((s) => s.userId!).filter(Boolean));
  if (section?.classTeacherId) ids.add(section.classTeacherId);
  return { ids, staffIds: section?.classTeacherId ? new Set([section.classTeacherId]) : new Set<string>() };
}

/** Same idea for one subject within a section: the roster plus whoever the
 * timetable actually has teaching that subject to that section — never
 * StaffSubject, which has no section and would hand the channel to every
 * teacher of that subject in the school. */
async function subjectGroupMembers(schoolId: string, sectionId: string, subjectId: string) {
  const [students, teachers] = await Promise.all([
    db.student.findMany({
      where: { schoolId, sectionId, status: "ACTIVE", userId: { not: null } },
      select: { userId: true },
    }),
    db.timetableEntry.findMany({
      where: { schoolId, sectionId, subjectId, staffId: { not: null } },
      distinct: ["staffId"],
      select: { staff: { select: { userId: true } } },
    }),
  ]);
  const ids = new Set(students.map((s) => s.userId!).filter(Boolean));
  const staffIds = new Set<string>();
  for (const t of teachers) {
    if (t.staff?.userId) {
      ids.add(t.staff.userId);
      staffIds.add(t.staff.userId);
    }
  }
  return { ids, staffIds };
}

/** Adds any member missing a ThreadParticipant row — additive only. A student
 * who transfers out keeps their row (matches the leftAt convention elsewhere:
 * removing history is not this table's job); they simply stop being resolved
 * into `ids` above on the next call, and canPostInThread/readAccess only ever
 * consult the current roster for GROUP threads' authorization, not this table. */
async function syncGroupParticipants(threadId: string, memberIds: Set<string>) {
  if (memberIds.size === 0) return;
  const existing = await db.threadParticipant.findMany({ where: { threadId }, select: { userId: true } });
  const already = new Set(existing.map((p) => p.userId));
  const toAdd = [...memberIds].filter((id) => !already.has(id));
  if (toAdd.length === 0) return;
  await db.threadParticipant.createMany({
    data: toAdd.map((userId) => ({ threadId, userId, unreadCount: 0 })),
    skipDuplicates: true,
  });
}

export type GroupThreadResult = Failure | { ok: true; threadId: string; canPost: boolean };

/** Finds or creates the one class-wide channel for a section, syncing in any
 * roster member the thread doesn't know about yet. */
export async function ensureClassGroupThread(actor: Actor, sectionId: string): Promise<GroupThreadResult> {
  const section = await db.section.findFirst({
    where: { id: sectionId, schoolId: actor.schoolId },
    include: { class: { select: { name: true } } },
  });
  if (!section) return { ok: false, status: 404, code: "not_found", message: "That section is not in this school." };

  const { ids, staffIds } = await classGroupMembers(actor.schoolId, sectionId);
  if (!ids.has(actor.id)) {
    return { ok: false, status: 403, code: "forbidden", message: "You are not part of this class." };
  }

  const threadKey = `GROUP|section|${sectionId}`;
  let thread = await db.messageThread.findFirst({ where: { schoolId: actor.schoolId, threadKey }, select: { id: true } });
  if (!thread) {
    thread = await db.messageThread.create({
      data: {
        schoolId: actor.schoolId,
        kind: "GROUP",
        groupSectionId: sectionId,
        threadKey,
        subject: `${section.class.name} ${section.name}`,
        createdByUserId: actor.id,
      },
      select: { id: true },
    });
  }

  await syncGroupParticipants(thread.id, ids);
  return { ok: true, threadId: thread.id, canPost: staffIds.has(actor.id) };
}

/** Same as above, scoped to one subject within a section. */
export async function ensureSubjectGroupThread(
  actor: Actor,
  sectionId: string,
  subjectId: string,
): Promise<GroupThreadResult> {
  const [section, subject] = await Promise.all([
    db.section.findFirst({ where: { id: sectionId, schoolId: actor.schoolId }, include: { class: { select: { name: true } } } }),
    db.subject.findFirst({ where: { id: subjectId, schoolId: actor.schoolId }, select: { name: true } }),
  ]);
  if (!section || !subject) {
    return { ok: false, status: 404, code: "not_found", message: "That class or subject is not in this school." };
  }

  const { ids, staffIds } = await subjectGroupMembers(actor.schoolId, sectionId, subjectId);
  if (!ids.has(actor.id)) {
    return { ok: false, status: 403, code: "forbidden", message: "You are not part of this subject's class." };
  }

  const threadKey = `GROUP|subject|${sectionId}|${subjectId}`;
  let thread = await db.messageThread.findFirst({ where: { schoolId: actor.schoolId, threadKey }, select: { id: true } });
  if (!thread) {
    thread = await db.messageThread.create({
      data: {
        schoolId: actor.schoolId,
        kind: "GROUP",
        groupSectionId: sectionId,
        groupSubjectId: subjectId,
        threadKey,
        subject: `${subject.name} · ${section.class.name} ${section.name}`,
        createdByUserId: actor.id,
      },
      select: { id: true },
    });
  }

  await syncGroupParticipants(thread.id, ids);
  return { ok: true, threadId: thread.id, canPost: staffIds.has(actor.id) };
}

export type MyGroupChannel = { threadId: string; label: string; kind: "CLASS" | "SUBJECT"; canPost: boolean };

/** Every group channel this account belongs in, right now — a student's own
 * class channel plus one per subject their class studies; a teacher's own
 * class-teacher channel(s) plus one per (section, subject) they actually
 * teach. Ensures each one exists before listing it, so a channel a teacher
 * has never posted in yet still shows up for students to find. */
export async function listMyGroupChannels(actor: Actor): Promise<MyGroupChannel[]> {
  const student = await db.student.findFirst({
    where: { schoolId: actor.schoolId, userId: actor.id, status: "ACTIVE" },
    select: { sectionId: true, classId: true },
  });

  const channels: MyGroupChannel[] = [];

  if (student?.sectionId) {
    const classResult = await ensureClassGroupThread(actor, student.sectionId);
    if (classResult.ok) {
      channels.push({ threadId: classResult.threadId, label: "Class", kind: "CLASS", canPost: classResult.canPost });
    }
    const subjects = await db.subject.findMany({
      where: { schoolId: actor.schoolId, classId: student.classId ?? undefined },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    for (const s of subjects) {
      const r = await ensureSubjectGroupThread(actor, student.sectionId, s.id);
      if (r.ok) channels.push({ threadId: r.threadId, label: s.name, kind: "SUBJECT", canPost: r.canPost });
    }
    return channels;
  }

  const classTeacherOf = await db.section.findMany({
    where: { schoolId: actor.schoolId, classTeacherId: actor.id },
    include: { class: { select: { name: true } } },
  });
  for (const section of classTeacherOf) {
    const r = await ensureClassGroupThread(actor, section.id);
    if (r.ok) {
      channels.push({ threadId: r.threadId, label: `${section.class.name} ${section.name}`, kind: "CLASS", canPost: r.canPost });
    }
  }

  const staff = await db.staff.findFirst({ where: { schoolId: actor.schoolId, userId: actor.id }, select: { id: true } });
  if (staff) {
    const taught = await db.timetableEntry.findMany({
      where: { schoolId: actor.schoolId, staffId: staff.id, subjectId: { not: null } },
      distinct: ["sectionId", "subjectId"],
      select: {
        sectionId: true,
        subjectId: true,
        section: { select: { name: true, class: { select: { name: true } } } },
        subject: { select: { name: true } },
      },
    });
    for (const t of taught) {
      if (!t.sectionId || !t.subjectId) continue;
      const r = await ensureSubjectGroupThread(actor, t.sectionId, t.subjectId);
      if (r.ok) {
        channels.push({
          threadId: r.threadId,
          label: `${t.subject?.name ?? "Subject"} · ${t.section?.class.name ?? ""} ${t.section?.name ?? ""}`.trim(),
          kind: "SUBJECT",
          canPost: r.canPost,
        });
      }
    }
  }

  return channels;
}

export type SetThreadMutedInput = { threadId: string; muted: boolean };
export type SetThreadMutedResult = Failure | { ok: true };

export async function setThreadMutedForActor(actor: Actor, input: SetThreadMutedInput): Promise<SetThreadMutedResult> {
  const updated = await db.threadParticipant.updateMany({
    where: { threadId: input.threadId, userId: actor.id, thread: { schoolId: actor.schoolId } },
    data: { mutedAt: input.muted ? new Date() : null },
  });
  if (updated.count === 0) {
    return { ok: false, status: 404, code: "not_found", message: "You are not part of that conversation." };
  }
  return { ok: true };
}

export type MarkThreadReadInput = { threadId: string };

/** Safe to call when there is nothing to clear — mirrors the web action exactly. */
export async function markThreadReadForActor(actor: Actor, input: MarkThreadReadInput): Promise<{ ok: true }> {
  await db.threadParticipant.updateMany({
    where: { threadId: input.threadId, userId: actor.id, thread: { schoolId: actor.schoolId } },
    data: { lastReadAt: new Date(), unreadCount: 0 },
  });
  return { ok: true };
}

export type OpenWithOversightInput = { threadId: string };
export type OversightMessage = { id: string; body: string; senderName: string; createdAt: string };
export type OpenWithOversightResult = Failure | { ok: true; messages: OversightMessage[] };

/**
 * The office opening a conversation it is not part of. Audited on every call —
 * see the long comment on the web action for why the messages come back FROM
 * this mutation rather than being unlocked by a query parameter.
 */
export async function openWithOversightForActor(
  actor: Actor,
  input: OpenWithOversightInput,
): Promise<OpenWithOversightResult> {
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
  if (!me) return { ok: false, status: 403, code: "forbidden", message: "Your account is not attached to this school." };
  if (!thread) return { ok: false, status: 404, code: "not_found", message: "That conversation no longer exists." };

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

  if (!access.allowed) {
    return { ok: false, status: 403, code: "forbidden", message: access.reason ?? "This conversation is not yours to read." };
  }
  if (access.mode !== "OVERSIGHT") {
    // A participant does not need this door, and must not be given an audit row
    // that says they exercised oversight over their own conversation.
    return { ok: false, status: 403, code: "already_participant", message: "You are already part of this conversation." };
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

  return {
    ok: true,
    messages: thread.messages.map((m) => ({
      id: m.id,
      body: m.body,
      senderName: m.sender.name,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export type SetThreadClosedInput = { threadId: string; closed: boolean };
export type SetThreadClosedResult = Failure | { ok: true };

export async function setThreadClosedForActor(actor: Actor, input: SetThreadClosedInput): Promise<SetThreadClosedResult> {
  if (!hasRole(actor, ...OFFICE)) {
    return { ok: false, status: 403, code: "forbidden", message: "Only the office can close or reopen a conversation." };
  }

  const thread = await db.messageThread.findFirst({
    where: { id: input.threadId, schoolId: actor.schoolId },
    include: { participants: { select: { user: { select: { name: true } } } } },
  });
  if (!thread) return { ok: false, status: 404, code: "not_found", message: "That conversation no longer exists." };
  if (Boolean(thread.closedAt) === input.closed) {
    return {
      ok: false,
      status: 422,
      code: "already_state",
      message: input.closed ? "That conversation is already closed." : "That conversation is already open.",
    };
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

  return { ok: true };
}
