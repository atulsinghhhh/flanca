import { db } from "@/lib/db";
import { canStartThread, isOffice, type ChatPerson, type ChatRole, type ChatStudentFact } from "@/lib/core/chat-core";

/**
 * Read models for the school's own chat.
 *
 * The only interesting one is getChatPerson: every permission decision in
 * chat-core needs facts that the session does not carry, and two of them live in
 * different id spaces — Section.classTeacherId points at a User, TimetableEntry
 * .staffId points at a Staff. Resolving those wrongly fails open, so it is done
 * here, once.
 */

/** Every fact chat-core needs about one person, for this school only. */
export async function getChatPerson(schoolId: string, userId: string): Promise<ChatPerson | null> {
  const [roleRows, staff, classTeacherOf, parentLinks] = await Promise.all([
    db.schoolRole.findMany({ where: { userId, schoolId }, select: { role: true } }),
    db.staff.findFirst({ where: { schoolId, userId }, select: { id: true, isActive: true } }),
    db.section.findMany({ where: { schoolId, classTeacherId: userId }, select: { id: true } }),
    db.parentLink.findMany({ where: { schoolId, userId }, select: { studentId: true } }),
  ]);

  if (roleRows.length === 0) return null;

  // Only the timetable says which sections a teacher actually stands in front of.
  // StaffSubject would be wrong here: it has no section and no school.
  const teaches = staff
    ? await db.timetableEntry.findMany({
        where: { schoolId, staffId: staff.id },
        select: { sectionId: true },
        distinct: ["sectionId"],
      })
    : [];

  return {
    userId,
    schoolId,
    roles: roleRows.map((r) => r.role) as ChatRole[],
    staffId: staff?.id ?? null,
    isActiveStaff: Boolean(staff?.isActive),
    classTeacherOfSectionIds: classTeacherOf.map((s) => s.id),
    teachesSectionIds: teaches.map((t) => t.sectionId).filter((id): id is string => Boolean(id)),
    parentOfStudentIds: parentLinks.map((p) => p.studentId),
  };
}

/** The student facts chat-core needs, for one child. */
export async function getChatStudent(schoolId: string, studentId: string): Promise<ChatStudentFact | null> {
  const s = await db.student.findFirst({
    where: { id: studentId, schoolId },
    select: { id: true, schoolId: true, sectionId: true, status: true },
  });
  if (!s) return null;
  return { studentId: s.id, schoolId: s.schoolId, sectionId: s.sectionId, isActive: s.status === "ACTIVE" };
}

/** The badge in the sidebar. One indexed count, on every page load, for every role. */
export async function getUnreadThreadCount(schoolId: string, userId: string) {
  return db.threadParticipant.count({
    where: { userId, leftAt: null, unreadCount: { gt: 0 }, thread: { schoolId } },
  });
}

/** One row of the conversation list — the shape the chat sidebar renders. */
export type InboxRow = {
  threadId: string;
  kind: "DIRECT" | "BROADCAST_REPLY" | "GROUP";
  with: string;
  theirRole: string | null;
  about: string | null;
  subject: string | null;
  unread: number;
  closed: boolean;
  lastMessageAt: Date;
  preview: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  PRINCIPAL: "Principal",
  ADMIN: "Admin",
  ACCOUNTANT: "Accounts",
  TEACHER: "Teacher",
  LIBRARIAN: "Librarian",
  STUDENT: "Student",
};

const RELATION_LABELS: Record<string, string> = { FATHER: "Father", MOTHER: "Mother", GUARDIAN: "Guardian" };

export type ParentLinkFact = {
  studentId: string;
  relation: string;
  studentName: string;
  className: string | null;
  sectionName: string | null;
};
export type StaffFact = { designation: string | null; department: string | null } | null;

/**
 * "Who is this, really" — the whole point of not being a WhatsApp group is
 * that every conversation is with a named, roled person, so the screen should
 * say so rather than making you guess from a name alone. A parent shows as
 * whose parent they are, of which child, in which class — enough to place
 * them without opening their record. Staff shows their actual designation
 * ("Senior Teacher", not just "Teacher") since a school has several of most
 * roles and a bare role name does not distinguish one from another.
 */
function describeCounterpart(roles: ChatRole[], staff: StaffFact, parentLinks: ParentLinkFact[], threadStudentId: string | null): string | null {
  if (roles.length === 0 && parentLinks.length === 0) return null;

  const isStaff = roles.some((r) => r !== "PARENT" && r !== "STUDENT");
  if (isStaff) {
    const staffRole = roles.find((r) => r !== "PARENT" && r !== "STUDENT");
    const roleLabel = staffRole ? (ROLE_LABELS[staffRole] ?? staffRole) : null;
    const label = staff?.designation ?? roleLabel;
    if (!label) return null;
    return staff?.department ? `${label} · ${staff.department}` : label;
  }

  if (parentLinks.length > 0) {
    // The thread's own linked child, if this conversation is about one —
    // exact, no guessing among a parent's several children.
    const forThisThread = threadStudentId ? parentLinks.find((l) => l.studentId === threadStudentId) : null;
    const link = forThisThread ?? parentLinks[0];
    const relation = RELATION_LABELS[link.relation] ?? "Parent";
    const classLine = `${link.className ?? ""} ${link.sectionName ?? ""}`.trim();
    return classLine ? `${relation} of ${link.studentName} · ${classLine}` : `${relation} of ${link.studentName}`;
  }

  if (roles.includes("STUDENT")) return "Student";
  return null;
}

/**
 * Conversations this person is in, most recently spoken in first.
 *
 * Closed ones are out by default: a class teacher should not carry five years of
 * other people's families in their inbox. They are one link away, never deleted.
 */
export async function getInbox(schoolId: string, userId: string, filters: { closed?: boolean } = {}): Promise<InboxRow[]> {
  const rows = await db.threadParticipant.findMany({
    where: {
      userId,
      leftAt: null,
      thread: { schoolId, closedAt: filters.closed ? { not: null } : null },
    },
    orderBy: { thread: { lastMessageAt: "desc" } },
    take: 60,
    include: {
      thread: {
        include: {
          student: {
            select: { id: true, name: true, class: { select: { name: true } }, section: { select: { name: true } } },
          },
          participants: { include: { user: { select: { id: true, name: true } } } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, senderUserId: true } },
        },
      },
    },
  });

  // One counterpart per DIRECT thread (GROUP has many, and the label there is
  // the channel itself) — batched across the whole page rather than per row,
  // so a 60-thread inbox is two extra queries, not sixty.
  const counterpartIds = Array.from(
    new Set(
      rows.flatMap((row) =>
        row.thread.kind === "GROUP"
          ? []
          : row.thread.participants.filter((p) => p.userId !== userId).map((p) => p.userId),
      ),
    ),
  );

  const [roleRows, parentLinkRows, staffRows] = await Promise.all([
    counterpartIds.length > 0
      ? db.schoolRole.findMany({ where: { schoolId, userId: { in: counterpartIds } }, select: { userId: true, role: true } })
      : Promise.resolve([]),
    counterpartIds.length > 0
      ? db.parentLink.findMany({
          where: { schoolId, userId: { in: counterpartIds } },
          select: {
            userId: true,
            studentId: true,
            relation: true,
            student: { select: { name: true, class: { select: { name: true } }, section: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
    counterpartIds.length > 0
      ? db.staff.findMany({ where: { schoolId, userId: { in: counterpartIds } }, select: { userId: true, designation: true, department: true } })
      : Promise.resolve([]),
  ]);

  const rolesByUser = new Map<string, ChatRole[]>();
  for (const r of roleRows) rolesByUser.set(r.userId, [...(rolesByUser.get(r.userId) ?? []), r.role as ChatRole]);
  const parentLinksByUser = new Map<string, ParentLinkFact[]>();
  for (const l of parentLinkRows) {
    parentLinksByUser.set(l.userId, [
      ...(parentLinksByUser.get(l.userId) ?? []),
      {
        studentId: l.studentId,
        relation: l.relation,
        studentName: l.student.name,
        className: l.student.class?.name ?? null,
        sectionName: l.student.section?.name ?? null,
      },
    ]);
  }
  const staffByUser = new Map<string, StaffFact>();
  for (const s of staffRows) staffByUser.set(s.userId, { designation: s.designation, department: s.department });

  return rows.map((row) => {
    const otherIds = row.thread.participants.filter((p) => p.userId !== userId).map((p) => p.userId);
    const others = row.thread.participants.filter((p) => p.userId !== userId).map((p) => p.user.name);
    const last = row.thread.messages[0] ?? null;
    return {
      threadId: row.thread.id,
      kind: row.thread.kind,
      // A GROUP channel's "who is this with" is the channel itself, not a roll
      // call of everyone in the class — that's what `subject` is for below.
      with: row.thread.kind === "GROUP" ? (row.thread.subject ?? "Channel") : others.join(", ") || "—",
      theirRole:
        row.thread.kind === "GROUP" || otherIds.length !== 1
          ? null
          : describeCounterpart(
              rolesByUser.get(otherIds[0]) ?? [],
              staffByUser.get(otherIds[0]) ?? null,
              parentLinksByUser.get(otherIds[0]) ?? [],
              row.thread.studentId,
            ),
      about: row.thread.student
        ? `${row.thread.student.name} · ${row.thread.student.class?.name ?? ""}${row.thread.student.section ? ` ${row.thread.student.section.name}` : ""}`
        : null,
      subject: row.thread.subject,
      unread: row.unreadCount,
      closed: Boolean(row.thread.closedAt),
      lastMessageAt: row.thread.lastMessageAt,
      preview: last ? `${last.senderUserId === userId ? "You: " : ""}${last.body}` : null,
    };
  });
}

/** So the inbox can offer the link to them honestly, or not at all. */
export async function countClosedThreads(schoolId: string, userId: string) {
  return db.threadParticipant.count({
    where: { userId, leftAt: null, thread: { schoolId, closedAt: { not: null } } },
  });
}

/**
 * One conversation, with everything the page needs to decide access.
 * Returns null when it does not exist in this school — the caller then decides
 * between "not found" and "not yours", and must not leak which.
 */
export async function getThread(schoolId: string, threadId: string, userId: string) {
  const thread = await db.messageThread.findFirst({
    where: { id: threadId, schoolId },
    include: {
      student: {
        select: { id: true, name: true, admissionNumber: true, class: { select: { name: true } }, section: { select: { name: true } } },
      },
      participants: { include: { user: { select: { id: true, name: true } } } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { id: true, name: true } } } },
    },
  });
  if (!thread) return null;

  const mine = thread.participants.find((p) => p.userId === userId) ?? null;

  const otherIds = thread.participants.filter((p) => p.userId !== userId).map((p) => p.userId);
  let theirRole: string | null = null;
  if (thread.kind !== "GROUP" && otherIds.length === 1) {
    const [roleRows, parentLinks, staff] = await Promise.all([
      db.schoolRole.findMany({ where: { schoolId, userId: otherIds[0] }, select: { role: true } }),
      db.parentLink.findMany({
        where: { schoolId, userId: otherIds[0] },
        select: {
          studentId: true,
          relation: true,
          student: { select: { name: true, class: { select: { name: true } }, section: { select: { name: true } } } },
        },
      }),
      db.staff.findFirst({ where: { schoolId, userId: otherIds[0] }, select: { designation: true, department: true } }),
    ]);
    theirRole = describeCounterpart(
      roleRows.map((r) => r.role as ChatRole),
      staff,
      parentLinks.map((l) => ({
        studentId: l.studentId,
        relation: l.relation,
        studentName: l.student.name,
        className: l.student.class?.name ?? null,
        sectionName: l.student.section?.name ?? null,
      })),
      thread.studentId,
    );
  }

  return {
    thread: {
      threadId: thread.id,
      schoolId: thread.schoolId,
      kind: thread.kind,
      studentId: thread.studentId,
      closedAt: thread.closedAt,
    },
    subject: thread.subject,
    theirRole,
    student: thread.student,
    participants: thread.participants.map((p) => ({ userId: p.userId, name: p.user.name, leftAt: p.leftAt })),
    messages: thread.messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      senderUserId: m.senderUserId,
      senderName: m.sender.name,
      mine: m.senderUserId === userId,
    })),
    isParticipant: Boolean(mine),
    hasLeft: Boolean(mine?.leftAt),
    myUnread: mine?.unreadCount ?? 0,
  };
}

export type Contact = {
  userId: string;
  name: string;
  role: string;
  group: string;
  studentId: string | null;
  studentName: string | null;
};

/**
 * Who this person may write to.
 *
 * Two rules shape it. The candidate sets are bounded and derived from real school
 * relationships — never a search over the user table, which is how a parent would
 * enumerate other parents. And every candidate is then put through the same
 * chat-core function the action enforces, so the list can never offer a door the
 * action would slam.
 *
 * The number of queries here is fixed, not per candidate: a class teacher of two
 * sections has seventy-odd families, and a round trip each would make the page
 * unusable on a school's connection.
 */
export async function getStartableContacts(schoolId: string, me: ChatPerson): Promise<Contact[]> {
  const mySectionIds = Array.from(new Set([...me.classTeacherOfSectionIds, ...me.teachesSectionIds]));
  // The office (and accounts, per chat-core) may open the door to any family in the
  // school, not only the ones a class/subject teacher happens to stand in front of.
  const canReachAnyParent = isOffice(me.roles) || me.roles.includes("ACCOUNTANT");

  const [children, staffRows, deskRows, taught, allFamilies] = await Promise.all([
    // A parent's own children, and who each child's class teacher is.
    me.parentOfStudentIds.length > 0
      ? db.student.findMany({
          where: { schoolId, id: { in: me.parentOfStudentIds } },
          select: {
            id: true,
            name: true,
            status: true,
            sectionId: true,
            section: { select: { classTeacher: { select: { id: true, name: true } } } },
          },
        })
      : Promise.resolve([]),

    // Colleagues, for anyone on the payroll.
    me.isActiveStaff
      ? db.staff.findMany({
          where: { schoolId, isActive: true, userId: { not: me.userId } },
          select: { userId: true, designation: true, user: { select: { name: true } } },
          orderBy: { user: { name: "asc" } },
          take: 300,
        })
      : Promise.resolve([]),

    // The office and accounts are always reachable by name.
    db.schoolRole.findMany({
      where: { schoolId, role: { in: ["OWNER", "PRINCIPAL", "ADMIN", "ACCOUNTANT"] } },
      select: { role: true, userId: true, user: { select: { name: true } } },
    }),

    // The families a teacher actually teaches.
    mySectionIds.length > 0
      ? db.student.findMany({
          where: { schoolId, status: "ACTIVE", sectionId: { in: mySectionIds } },
          select: {
            id: true,
            name: true,
            status: true,
            sectionId: true,
            rollNumber: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
            parentLinks: { select: { userId: true, relation: true, user: { select: { name: true } } } },
          },
          orderBy: [{ sectionId: "asc" }, { rollNumber: "asc" }],
          take: 400,
        })
      : Promise.resolve([]),

    // The whole school's families, for the office (and accounts) — bounded, same
    // shape as "taught", just not restricted to sections this person teaches.
    canReachAnyParent
      ? db.student.findMany({
          where:
            mySectionIds.length > 0
              ? { schoolId, status: "ACTIVE", OR: [{ sectionId: null }, { sectionId: { notIn: mySectionIds } }] }
              : { schoolId, status: "ACTIVE" },
          select: {
            id: true,
            name: true,
            status: true,
            sectionId: true,
            rollNumber: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
            parentLinks: { select: { userId: true, relation: true, user: { select: { name: true } } } },
          },
          orderBy: [{ class: { sequenceOrder: "asc" } }, { sectionId: "asc" }, { rollNumber: "asc" }],
          take: 1000,
        })
      : Promise.resolve([]),
  ]);

  type Candidate = Contact & { targetRoles: ChatRole[]; targetClassTeacherOf: string[]; student: ChatStudentFact | null };
  const candidates: Candidate[] = [];

  for (const child of children) {
    const ct = child.section?.classTeacher;
    if (!ct) continue;
    candidates.push({
      userId: ct.id,
      name: ct.name,
      role: "Class teacher",
      group: "Your children",
      studentId: child.id,
      studentName: child.name,
      targetRoles: ["TEACHER"],
      targetClassTeacherOf: child.sectionId ? [child.sectionId] : [],
      student: {
        studentId: child.id,
        schoolId,
        sectionId: child.sectionId,
        isActive: child.status === "ACTIVE",
      },
    });
  }

  for (const s of staffRows) {
    candidates.push({
      userId: s.userId,
      name: s.user.name,
      role: s.designation ?? "Staff",
      group: "Colleagues",
      studentId: null,
      studentName: null,
      targetRoles: ["TEACHER"],
      targetClassTeacherOf: [],
      student: null,
    });
  }

  for (const d of deskRows) {
    if (d.userId === me.userId) continue;
    candidates.push({
      userId: d.userId,
      name: d.user.name,
      role: d.role === "ACCOUNTANT" ? "Accounts" : "Office",
      group: d.role === "ACCOUNTANT" ? "Accounts" : "The office",
      studentId: null,
      studentName: null,
      targetRoles: [d.role as ChatRole],
      targetClassTeacherOf: [],
      student: null,
    });
  }

  for (const child of taught) {
    const where = `${child.class?.name ?? ""}${child.section ? ` ${child.section.name}` : ""}`.trim();
    for (const link of child.parentLinks) {
      candidates.push({
        userId: link.userId,
        name: link.user.name,
        role: `${title(link.relation)} of ${child.name}${where ? ` · ${where}` : ""}`,
        group: "Families you teach",
        studentId: child.id,
        studentName: child.name,
        targetRoles: ["PARENT"],
        targetClassTeacherOf: [],
        student: {
          studentId: child.id,
          schoolId,
          sectionId: child.sectionId,
          isActive: child.status === "ACTIVE",
        },
      });
    }
  }

  for (const child of allFamilies) {
    const where = `${child.class?.name ?? ""}${child.section ? ` ${child.section.name}` : ""}`.trim();
    for (const link of child.parentLinks) {
      candidates.push({
        userId: link.userId,
        name: link.user.name,
        role: `${title(link.relation)} of ${child.name}${where ? ` · ${where}` : ""}`,
        group: "Parents",
        studentId: child.id,
        studentName: child.name,
        targetRoles: ["PARENT"],
        targetClassTeacherOf: [],
        student: {
          studentId: child.id,
          schoolId,
          sectionId: child.sectionId,
          isActive: child.status === "ACTIVE",
        },
      });
    }
  }

  // One round trip for the roles of everybody in the list, so a staff member who
  // is also a parent is judged on their real roles rather than an assumption.
  const ids = Array.from(new Set(candidates.map((c) => c.userId)));
  const roleRows =
    ids.length > 0
      ? await db.schoolRole.findMany({ where: { schoolId, userId: { in: ids } }, select: { userId: true, role: true } })
      : [];
  const rolesOf = new Map<string, ChatRole[]>();
  for (const r of roleRows) {
    rolesOf.set(r.userId, [...(rolesOf.get(r.userId) ?? []), r.role as ChatRole]);
  }
  const activeStaffIds = new Set(
    (await db.staff.findMany({ where: { schoolId, isActive: true, userId: { in: ids } }, select: { userId: true } })).map(
      (s) => s.userId,
    ),
  );

  const seen = new Set<string>();
  const allowed: Contact[] = [];

  for (const c of candidates) {
    const key = `${c.userId}|${c.studentId ?? "-"}`;
    if (seen.has(key)) continue;

    const verdict = canStartThread({
      initiator: me,
      target: {
        userId: c.userId,
        schoolId,
        roles: rolesOf.get(c.userId) ?? c.targetRoles,
        staffId: null,
        isActiveStaff: activeStaffIds.has(c.userId),
        classTeacherOfSectionIds: c.targetClassTeacherOf,
        teachesSectionIds: [],
        parentOfStudentIds: c.studentId && c.group === "Families you teach" ? [c.studentId] : [],
      },
      student: c.student,
    });
    if (!verdict.allowed) continue;

    seen.add(key);
    allowed.push({
      userId: c.userId,
      name: c.name,
      role: c.role,
      group: c.group,
      studentId: c.studentId,
      studentName: c.studentName,
    });
  }

  return allowed;
}

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
