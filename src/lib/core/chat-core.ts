/**
 * Who may talk to whom, inside a school. Pure.
 *
 * This replaces the school's WhatsApp group, and the whole reason to replace it
 * is this file: in a group, every parent can see and message every other parent,
 * and nothing is on record. Here, a conversation is a place two named people are
 * *intended* to meet — so the rule has to live somewhere testable rather than
 * being spread across a page, an action and a directory query, where a single
 * missed clause quietly exposes one family's business to another.
 *
 * The organising principle: staff open doors; parents walk through open doors,
 * and may open exactly two themselves — their child's class teacher, and the
 * office. That asymmetry is what stops a teacher's inbox becoming the group chat
 * again, which is how WhatsApp failed the school in the first place.
 *
 * Every function takes facts the caller has already resolved from the database
 * and never reaches for one itself. Two of those facts are easy to resolve
 * wrongly and are called out on ChatPerson below, because both mistakes leak
 * data rather than blocking it.
 */

export type ChatRole =
  | "OWNER" | "PRINCIPAL" | "ADMIN" | "ACCOUNTANT"
  | "TEACHER" | "LIBRARIAN" | "STUDENT" | "PARENT";

export type ChatCheck = { allowed: boolean; reason: string | null };

/**
 * A read decision also says *how* it was allowed, because an oversight read has
 * to be written to the audit trail. If the caller had to work that out for
 * itself we would have two implementations of "was that oversight?", and the
 * one that drifts is the one that logs nothing.
 */
export type ChatReadCheck = ChatCheck & { mode: "PARTICIPANT" | "OVERSIGHT" | null };

/** Everything about one person that any rule here needs. */
export type ChatPerson = {
  userId: string;
  /** Roles held IN THIS SCHOOL. One user may hold TEACHER in two schools. */
  schoolId: string;
  roles: ChatRole[];
  /** Staff.id — a different id space from userId. Null for a parent. */
  staffId: string | null;
  /**
   * A Staff row that exists and is active. Mandatory, not decorative: nothing in
   * this product revokes a SchoolRole when a staff member goes inactive, so a
   * teacher who left last term can still sign in — and a principal who left
   * would otherwise keep reading every conversation in the school.
   */
  isActiveStaff: boolean;
  /** Sections this person is class teacher of — resolved via Section.classTeacherId, which points at User.id. */
  classTeacherOfSectionIds: string[];
  /**
   * Sections this person teaches in — resolved via TimetableEntry.staffId, which
   * points at Staff.id. Never resolve this from StaffSubject: that table has no
   * section and no school, so "teaches Mathematics" would grant a whole class
   * and sometimes a whole school.
   */
  teachesSectionIds: string[];
  parentOfStudentIds: string[];
};

/** The child a thread is about, when it is about one. */
export type ChatStudentFact = {
  studentId: string;
  schoolId: string;
  sectionId: string | null;
  isActive: boolean;
};

export type ChatThreadFact = {
  threadId: string;
  schoolId: string;
  kind: "DIRECT" | "BROADCAST_REPLY" | "GROUP";
  studentId: string | null;
  closedAt: Date | null;
};

const OFFICE_ROLES: ChatRole[] = ["OWNER", "PRINCIPAL", "ADMIN"];
const STAFF_ROLES: ChatRole[] = ["OWNER", "PRINCIPAL", "ADMIN", "ACCOUNTANT", "TEACHER", "LIBRARIAN"];

/** The office: may reach anyone, and may read anything — audited. */
export function isOffice(roles: ChatRole[]): boolean {
  return roles.some((r) => OFFICE_ROLES.includes(r));
}

export function isStaff(roles: ChatRole[]): boolean {
  return roles.some((r) => STAFF_ROLES.includes(r));
}

/**
 * A parent and nothing else. The distinction matters because a teacher whose own
 * child studies at the school holds both roles — common enough that treating
 * "has PARENT" as "is a parent" would block half the staffroom from doing their
 * job.
 */
export function isParentOnly(roles: ChatRole[]): boolean {
  return roles.includes("PARENT") && !isStaff(roles);
}

function isStudentOnly(roles: ChatRole[]): boolean {
  return roles.includes("STUDENT") && !isStaff(roles) && !roles.includes("PARENT");
}

const ALLOWED: ChatCheck = { allowed: true, reason: null };

const deny = (reason: string): ChatCheck => ({ allowed: false, reason });

/**
 * The identity of a conversation as it was founded: kind, its members, and the
 * child it is about. Stored on the thread and uniquely indexed, because a plain
 * unique index cannot do this job — studentId is nullable, Postgres treats NULLs
 * as distinct, and two office-to-parent threads with no child attached would
 * both insert. A parent double-tapping on a slow phone would get two
 * conversations and the teacher would answer in one of them.
 *
 * It deliberately does NOT track membership changes afterwards. You never want
 * to deduplicate against a set that has since been added to.
 */
export function threadKeyFor(params: {
  kind: string;
  userIds: string[];
  studentId?: string | null;
}): string {
  const ids = Array.from(new Set(params.userIds)).sort();
  return `${params.kind}|${ids.join(",")}|${params.studentId ?? "-"}`;
}

/**
 * May this person open a conversation with that one?
 *
 * A refusal always carries a sentence, because every refusal here is shown to
 * somebody who believes they are doing something reasonable.
 */
export function canStartThread(params: {
  initiator: ChatPerson;
  target: ChatPerson;
  student: ChatStudentFact | null;
}): ChatCheck {
  const { initiator, target, student } = params;

  if (initiator.userId === target.userId) {
    return deny("You cannot start a conversation with yourself.");
  }
  if (initiator.schoolId !== target.schoolId) {
    return deny("That person is not part of this school.");
  }
  if (isStudentOnly(initiator.roles) || isStudentOnly(target.roles)) {
    return deny("Students do not have chat yet — they still receive homework and notices.");
  }

  // Neither side is staff, so this is one parent trying to reach another. This is
  // the single rule the whole feature exists to enforce.
  if (!isStaff(initiator.roles) && !isStaff(target.roles)) {
    return deny("Parents cannot message each other here. The school is not a group chat.");
  }

  const initiatorIsStaff = isStaff(initiator.roles);
  const targetIsStaff = isStaff(target.roles);

  if (initiatorIsStaff && !initiator.isActiveStaff) {
    return deny("You are no longer an active member of staff at this school.");
  }
  if (targetIsStaff && !target.isActiveStaff) {
    return deny("That member of staff has left the school.");
  }

  // Staff to staff: the staffroom. Anyone on the payroll may reach anyone else.
  if (initiatorIsStaff && targetIsStaff) return ALLOWED;

  // Staff to parent.
  if (initiatorIsStaff) {
    if (isOffice(initiator.roles)) return ALLOWED;
    if (initiator.roles.includes("ACCOUNTANT")) return ALLOWED;

    if (initiator.roles.includes("TEACHER")) {
      const anchored = anchorCheck(student, initiator.schoolId);
      if (!anchored.allowed) return anchored;
      const s = student as ChatStudentFact;

      if (!target.parentOfStudentIds.includes(s.studentId)) {
        return deny("That person is not a parent of this student.");
      }
      const mine = [...initiator.classTeacherOfSectionIds, ...initiator.teachesSectionIds];
      if (!s.sectionId || !mine.includes(s.sectionId)) {
        return deny("You can only message the parents of children you teach.");
      }
      return ALLOWED;
    }

    // Librarian, and anything else without a route to a family.
    return deny("The library reaches parents through a notice, not a conversation.");
  }

  // Parent to staff. A parent may open exactly two doors.
  if (isOffice(target.roles) || target.roles.includes("ACCOUNTANT")) return ALLOWED;

  if (target.roles.includes("TEACHER")) {
    const anchored = anchorCheck(student, initiator.schoolId);
    if (!anchored.allowed) return anchored;
    const s = student as ChatStudentFact;

    if (!initiator.parentOfStudentIds.includes(s.studentId)) {
      return deny("You can only start a conversation about your own child.");
    }
    if (!s.sectionId) {
      return deny("This child has not been given a class yet, so there is no class teacher to write to.");
    }
    if (!target.classTeacherOfSectionIds.includes(s.sectionId)) {
      return deny("Write to the class teacher — she will bring the subject teacher in.");
    }
    return ALLOWED;
  }

  return deny("You can write to the class teacher, the office or accounts.");
}

/** A conversation about a child needs that child, present and still at the school. */
function anchorCheck(student: ChatStudentFact | null, schoolId: string): ChatCheck {
  if (!student) return deny("A conversation with a parent has to be about a particular child.");
  if (student.schoolId !== schoolId) return deny("That child is not on this school's roll.");
  if (!student.isActive) {
    return deny("This student has left the school. The old conversation stays readable, but a new one cannot be started.");
  }
  return ALLOWED;
}

/**
 * May this person say something here?
 *
 * Note what is NOT re-checked: whether a teacher still teaches the child. A
 * class teacher handover mid-year would otherwise turn a live conversation about
 * a child read-only, mid-sentence. Participation is a fact of history;
 * permission to *start* is a fact of now.
 */
export function canPostInThread(params: {
  actor: ChatPerson;
  thread: ChatThreadFact;
  isParticipant: boolean;
  hasLeft: boolean;
  /**
   * Whether the child this conversation is about is still on the roll. Pass it
   * where it is known; undefined means "not asked", which is not the same as false.
   */
  studentIsActive?: boolean;
}): ChatCheck {
  const { actor, thread, isParticipant, hasLeft } = params;

  if (actor.schoolId !== thread.schoolId) {
    return deny("That conversation belongs to another school.");
  }
  if (!isParticipant || hasLeft) {
    return deny("You are not part of this conversation.");
  }
  if (thread.closedAt) {
    return deny("This conversation has been closed. The office can reopen it.");
  }
  // A GROUP channel is announcement-only: everyone in it reads, only staff post —
  // that asymmetry is the whole reason it isn't a WhatsApp group.
  if (thread.kind === "GROUP" && !isStaff(actor.roles)) {
    return deny("Only the class or subject teacher can post here.");
  }
  if (isStaff(actor.roles) && !actor.isActiveStaff) {
    return deny("You are no longer an active member of staff at this school.");
  }
  if (isParentOnly(actor.roles) && thread.studentId && !actor.parentOfStudentIds.includes(thread.studentId)) {
    return deny("You are no longer listed as a guardian of this student.");
  }
  // A child who has left keeps their history — a family that has left does not keep
  // a live line into the staffroom.
  if (thread.studentId && params.studentIsActive === false) {
    return deny("This student has left the school, so this conversation is now read-only.");
  }
  return ALLOWED;
}

/**
 * May this person read it, and on what grounds?
 *
 * The office can read anything — that is what lets a principal answer "what did
 * the teacher actually say to that parent?" — but the caller must audit an
 * OVERSIGHT read, which is why the mode comes back with the verdict.
 */
export function readAccess(params: {
  actor: ChatPerson;
  thread: ChatThreadFact;
  isParticipant: boolean;
  hasLeft: boolean;
}): ChatReadCheck {
  const { actor, thread, isParticipant, hasLeft } = params;

  if (actor.schoolId !== thread.schoolId) {
    return { allowed: false, reason: "That conversation belongs to another school.", mode: null };
  }

  if (isParticipant && !hasLeft) {
    // A guardian removed after a custody change stops reading, even though the
    // participant row survives so the record of who could read what remains.
    if (isParentOnly(actor.roles) && thread.studentId && !actor.parentOfStudentIds.includes(thread.studentId)) {
      return { allowed: false, reason: "You are no longer listed as a guardian of this student.", mode: null };
    }
    return { allowed: true, reason: null, mode: "PARTICIPANT" };
  }

  // Oversight is the office only, and only while they are still on the payroll.
  // The accountant sits in the money roles and is deliberately not here: reusing
  // that group would hand them every parent-teacher conversation in the school.
  if (isOffice(actor.roles) && actor.isActiveStaff) {
    return { allowed: true, reason: null, mode: "OVERSIGHT" };
  }

  return { allowed: false, reason: "This conversation is not yours to read.", mode: null };
}

/**
 * May this person be brought into an existing conversation?
 *
 * The clause that matters is the last one: two parents never end up in the same
 * conversation, however the invitation was made.
 */
export function canBeAddedToThread(params: {
  candidate: ChatPerson;
  addedBy: ChatPerson;
  thread: ChatThreadFact;
  /** The roles of everyone already in the conversation. */
  existingRoles: ChatRole[][];
}): ChatCheck {
  const { candidate, addedBy, thread, existingRoles } = params;

  if (candidate.schoolId !== thread.schoolId || addedBy.schoolId !== thread.schoolId) {
    return deny("That conversation belongs to another school.");
  }
  if (thread.closedAt) {
    return deny("This conversation has been closed.");
  }
  if (!isOffice(addedBy.roles) || !addedBy.isActiveStaff) {
    return deny("Only the office can bring someone into a conversation.");
  }
  if (isStudentOnly(candidate.roles)) {
    return deny("Students do not have chat yet — they still receive homework and notices.");
  }
  if (isStaff(candidate.roles) && !candidate.isActiveStaff) {
    return deny("That member of staff has left the school.");
  }
  if (isParentOnly(candidate.roles) && existingRoles.some((roles) => isParentOnly(roles))) {
    return deny("A conversation never holds two parents.");
  }
  return ALLOWED;
}
