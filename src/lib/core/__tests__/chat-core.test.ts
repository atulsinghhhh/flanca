import { describe, expect, it } from "vitest";
import {
  canBeAddedToThread,
  canPostInThread,
  canStartThread,
  isParentOnly,
  readAccess,
  threadKeyFor,
  type ChatPerson,
  type ChatStudentFact,
  type ChatThreadFact,
} from "../chat-core";

const BLANK: ChatPerson = {
  userId: "u-blank",
  schoolId: "school-1",
  roles: [],
  staffId: null,
  isActiveStaff: false,
  classTeacherOfSectionIds: [],
  teachesSectionIds: [],
  parentOfStudentIds: [],
};

const person = (over: Partial<ChatPerson>): ChatPerson => ({ ...BLANK, ...over });

/** Priya: class teacher of 10 A, and she also takes maths in 9 B. */
const teacher = (over: Partial<ChatPerson> = {}) =>
  person({
    userId: "u-priya",
    roles: ["TEACHER"],
    staffId: "staff-priya",
    isActiveStaff: true,
    classTeacherOfSectionIds: ["sec-10a"],
    teachesSectionIds: ["sec-9b"],
    ...over,
  });

/** Ashok: father of Kabir, who is in 10 A. */
const parent = (over: Partial<ChatPerson> = {}) =>
  person({ userId: "u-ashok", roles: ["PARENT"], parentOfStudentIds: ["stu-kabir"], ...over });

const clerk = (over: Partial<ChatPerson> = {}) =>
  person({ userId: "u-clerk", roles: ["ADMIN"], staffId: "staff-clerk", isActiveStaff: true, ...over });

const principal = (over: Partial<ChatPerson> = {}) =>
  person({ userId: "u-head", roles: ["PRINCIPAL"], staffId: "staff-head", isActiveStaff: true, ...over });

const accountant = (over: Partial<ChatPerson> = {}) =>
  person({ userId: "u-acc", roles: ["ACCOUNTANT"], staffId: "staff-acc", isActiveStaff: true, ...over });

const librarian = (over: Partial<ChatPerson> = {}) =>
  person({ userId: "u-lib", roles: ["LIBRARIAN"], staffId: "staff-lib", isActiveStaff: true, ...over });

const student = (over: Partial<ChatPerson> = {}) =>
  person({ userId: "u-kabir", roles: ["STUDENT"], ...over });

const kabir = (over: Partial<ChatStudentFact> = {}): ChatStudentFact => ({
  studentId: "stu-kabir",
  schoolId: "school-1",
  sectionId: "sec-10a",
  isActive: true,
  ...over,
});

const thread = (over: Partial<ChatThreadFact> = {}): ChatThreadFact => ({
  threadId: "thread-1",
  schoolId: "school-1",
  kind: "DIRECT",
  studentId: "stu-kabir",
  closedAt: null,
  ...over,
});

describe("threadKeyFor — one conversation, however many times you tap send", () => {
  it("does not care who started it", () => {
    expect(threadKeyFor({ kind: "DIRECT", userIds: ["b", "a"], studentId: "stu-1" })).toBe(
      threadKeyFor({ kind: "DIRECT", userIds: ["a", "b"], studentId: "stu-1" }),
    );
  });

  it("ignores a repeated participant", () => {
    expect(threadKeyFor({ kind: "DIRECT", userIds: ["a", "a", "b"] })).toBe(
      threadKeyFor({ kind: "DIRECT", userIds: ["a", "b"] })
    );
  });

  it("uses a sentinel where there is no child, so two such threads still collide", () => {
    expect(threadKeyFor({ kind: "DIRECT", userIds: ["a", "b"], studentId: null })).toBe("DIRECT|a,b|-");
    expect(threadKeyFor({ kind: "DIRECT", userIds: ["a", "b"] })).toBe("DIRECT|a,b|-");
  });

  it("keeps two children of the same parent apart", () => {
    const first = threadKeyFor({ kind: "DIRECT", userIds: ["p", "t"], studentId: "stu-1" });
    const second = threadKeyFor({ kind: "DIRECT", userIds: ["p", "t"], studentId: "stu-2" });
    expect(first).not.toBe(second);
  });

  it("keeps a broadcast reply apart from a direct conversation", () => {
    expect(threadKeyFor({ kind: "BROADCAST_REPLY", userIds: ["a", "b"] })).not.toBe(
      threadKeyFor({ kind: "DIRECT", userIds: ["a", "b"] }),
    );
  });
});

describe("canStartThread — a teacher reaching a family", () => {
  it("allows the class teacher of the child's section", () => {
    expect(canStartThread({ initiator: teacher(), target: parent(), student: kabir() })).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it("allows a subject teacher who has that section on the timetable", () => {
    const arjun = parent({ userId: "u-arjun", parentOfStudentIds: ["stu-diya"] });
    const diya = kabir({ studentId: "stu-diya", sectionId: "sec-9b" });
    expect(canStartThread({ initiator: teacher(), target: arjun, student: diya }).allowed).toBe(true);
  });

  it("refuses a child the teacher does not teach", () => {
    const other = kabir({ sectionId: "sec-7c" });
    const check = canStartThread({ initiator: teacher(), target: parent(), student: other });
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/children you teach/);
  });

  it("refuses when the target is not that child's parent", () => {
    const stranger = parent({ userId: "u-stranger", parentOfStudentIds: ["stu-someone"] });
    const check = canStartThread({ initiator: teacher(), target: stranger, student: kabir() });
    expect(check.reason).toMatch(/not a parent of this student/);
  });

  it("refuses a conversation with a parent that is not about a child", () => {
    const check = canStartThread({ initiator: teacher(), target: parent(), student: null });
    expect(check.reason).toMatch(/about a particular child/);
  });

  it("refuses once the child has left the school", () => {
    const check = canStartThread({ initiator: teacher(), target: parent(), student: kabir({ isActive: false }) });
    expect(check.reason).toMatch(/has left the school/);
  });
});

describe("canStartThread — a parent may open exactly two doors", () => {
  it("allows the class teacher of their own child", () => {
    expect(canStartThread({ initiator: parent(), target: teacher(), student: kabir() }).allowed).toBe(true);
  });

  it("sends them to the class teacher instead of a subject teacher", () => {
    const subjectOnly = teacher({ classTeacherOfSectionIds: [], teachesSectionIds: ["sec-10a"] });
    const check = canStartThread({ initiator: parent(), target: subjectOnly, student: kabir() });
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/class teacher/);
  });

  it("refuses a conversation about somebody else's child", () => {
    const check = canStartThread({
      initiator: parent({ parentOfStudentIds: ["stu-someone-else"] }),
      target: teacher(),
      student: kabir(),
    });
    expect(check.reason).toMatch(/your own child/);
  });

  it("allows the office with no child attached at all", () => {
    expect(canStartThread({ initiator: parent(), target: clerk(), student: null }).allowed).toBe(true);
  });

  it("allows accounts, because the first question a parent has is money", () => {
    expect(canStartThread({ initiator: parent(), target: accountant(), student: null }).allowed).toBe(true);
  });

  it("refuses the librarian", () => {
    const check = canStartThread({ initiator: parent(), target: librarian(), student: null });
    expect(check.allowed).toBe(false);
  });

  it("says so plainly when a child has no class yet", () => {
    const check = canStartThread({ initiator: parent(), target: teacher(), student: kabir({ sectionId: null }) });
    expect(check.reason).toMatch(/no class teacher/);
  });
});

describe("canStartThread — the rule the whole feature exists for", () => {
  it("never lets one parent reach another", () => {
    const other = parent({ userId: "u-other", parentOfStudentIds: ["stu-diya"] });
    const check = canStartThread({ initiator: parent(), target: other, student: null });
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/not a group chat/);
  });

  it("still lets a teacher whose own child studies here message a parent", () => {
    const teacherAndParent = teacher({ roles: ["TEACHER", "PARENT"], parentOfStudentIds: ["stu-own"] });
    expect(canStartThread({ initiator: teacherAndParent, target: parent(), student: kabir() }).allowed).toBe(true);
  });

  it("and lets a parent reach that same person, who is the class teacher", () => {
    const teacherAndParent = teacher({ roles: ["TEACHER", "PARENT"], parentOfStudentIds: ["stu-own"] });
    expect(canStartThread({ initiator: parent(), target: teacherAndParent, student: kabir() }).allowed).toBe(true);
  });

  it("treats a teacher who is also a parent as staff, not as a parent", () => {
    expect(isParentOnly(["TEACHER", "PARENT"])).toBe(false);
    expect(isParentOnly(["PARENT"])).toBe(true);
  });
});

describe("canStartThread — students, staff and the edges", () => {
  it("keeps students out in this version, even though they have logins", () => {
    const check = canStartThread({ initiator: teacher(), target: student(), student: kabir() });
    expect(check.reason).toMatch(/Students do not have chat yet/);
  });

  it("lets any member of staff reach any other", () => {
    expect(canStartThread({ initiator: librarian(), target: accountant(), student: null }).allowed).toBe(true);
  });

  it("lets the office reach a parent with no child attached", () => {
    expect(canStartThread({ initiator: principal(), target: parent(), student: null }).allowed).toBe(true);
  });

  it("lets accounts reach any parent in the school", () => {
    expect(canStartThread({ initiator: accountant(), target: parent(), student: null }).allowed).toBe(true);
  });

  it("refuses the librarian a route to a family", () => {
    const check = canStartThread({ initiator: librarian(), target: parent(), student: kabir() });
    expect(check.reason).toMatch(/through a notice/);
  });

  it("refuses a teacher who has left the school", () => {
    const gone = teacher({ isActiveStaff: false });
    expect(canStartThread({ initiator: gone, target: parent(), student: kabir() }).reason).toMatch(
      /no longer an active member of staff/,
    );
  });

  it("refuses writing to a member of staff who has left", () => {
    const gone = teacher({ isActiveStaff: false });
    expect(canStartThread({ initiator: parent(), target: gone, student: kabir() }).reason).toMatch(
      /has left the school/,
    );
  });

  it("refuses a conversation with yourself", () => {
    expect(canStartThread({ initiator: clerk(), target: clerk(), student: null }).reason).toMatch(/yourself/);
  });

  it("never crosses a school boundary", () => {
    const elsewhere = parent({ schoolId: "school-2" });
    expect(canStartThread({ initiator: teacher(), target: elsewhere, student: kabir() }).reason).toMatch(
      /not part of this school/,
    );
  });

  it("refuses a child from another school as the anchor", () => {
    const check = canStartThread({ initiator: teacher(), target: parent(), student: kabir({ schoolId: "school-2" }) });
    expect(check.reason).toMatch(/not on this school's roll/);
  });
});

describe("canPostInThread — a live conversation must not go quiet on its own", () => {
  const inside = { isParticipant: true, hasLeft: false };

  it("lets a participant reply", () => {
    expect(canPostInThread({ actor: parent(), thread: thread(), ...inside })).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it("still lets a teacher reply after a class-teacher handover", () => {
    const handedOver = teacher({ classTeacherOfSectionIds: [], teachesSectionIds: [] });
    expect(canPostInThread({ actor: handedOver, thread: thread(), ...inside }).allowed).toBe(true);
  });

  it("refuses someone who was never in it", () => {
    const check = canPostInThread({ actor: clerk(), thread: thread(), isParticipant: false, hasLeft: false });
    expect(check.reason).toMatch(/not part of this conversation/);
  });

  it("refuses someone who has been taken out of it", () => {
    expect(canPostInThread({ actor: parent(), thread: thread(), isParticipant: true, hasLeft: true }).allowed).toBe(
      false,
    );
  });

  it("refuses a closed conversation, and says who can reopen it", () => {
    const check = canPostInThread({ actor: parent(), thread: thread({ closedAt: new Date() }), ...inside });
    expect(check.reason).toMatch(/office can reopen/);
  });

  it("refuses a member of staff who has left", () => {
    expect(canPostInThread({ actor: teacher({ isActiveStaff: false }), thread: thread(), ...inside }).allowed).toBe(
      false,
    );
  });

  it("goes read-only once the child has left the school", () => {
    const check = canPostInThread({ actor: teacher(), thread: thread(), ...inside, studentIsActive: false });
    expect(check.reason).toMatch(/read-only/);
  });

  it("does not treat an unasked student status as a departure", () => {
    expect(canPostInThread({ actor: teacher(), thread: thread(), ...inside }).allowed).toBe(true);
    expect(
      canPostInThread({ actor: teacher(), thread: thread(), ...inside, studentIsActive: true }).allowed,
    ).toBe(true);
  });

  it("refuses a guardian whose link was removed after a custody change", () => {
    const removed = parent({ parentOfStudentIds: [] });
    expect(canPostInThread({ actor: removed, thread: thread(), ...inside }).reason).toMatch(/no longer listed as a guardian/);
  });
});

describe("readAccess — the office can answer 'what did the teacher actually say?'", () => {
  const inside = { isParticipant: true, hasLeft: false };
  const outside = { isParticipant: false, hasLeft: false };

  it("reads as a participant", () => {
    expect(readAccess({ actor: parent(), thread: thread(), ...inside })).toEqual({
      allowed: true,
      reason: null,
      mode: "PARTICIPANT",
    });
  });

  it("lets the principal read a conversation she is not in, and flags it as oversight", () => {
    expect(readAccess({ actor: principal(), thread: thread(), ...outside })).toEqual({
      allowed: true,
      reason: null,
      mode: "OVERSIGHT",
    });
  });

  it("does not give the accountant oversight — money roles are not the office", () => {
    const check = readAccess({ actor: accountant(), thread: thread(), ...outside });
    expect(check.allowed).toBe(false);
    expect(check.mode).toBe(null);
  });

  it("does not give another teacher oversight, not even of the same child", () => {
    expect(readAccess({ actor: teacher(), thread: thread(), ...outside }).allowed).toBe(false);
  });

  it("takes oversight away from a principal who has left", () => {
    expect(readAccess({ actor: principal({ isActiveStaff: false }), thread: thread(), ...outside }).allowed).toBe(false);
  });

  it("stops a removed guardian reading on, participant row or not", () => {
    const removed = parent({ parentOfStudentIds: [] });
    expect(readAccess({ actor: removed, thread: thread(), ...inside }).allowed).toBe(false);
  });

  it("refuses someone who left the conversation", () => {
    expect(readAccess({ actor: parent(), thread: thread(), isParticipant: true, hasLeft: true }).allowed).toBe(false);
  });

  it("never reads across a school boundary, even for a principal", () => {
    const check = readAccess({ actor: principal({ schoolId: "school-2" }), thread: thread(), ...outside });
    expect(check.reason).toMatch(/another school/);
  });
});

describe("canBeAddedToThread — nobody joins who could not have been written to", () => {
  const base = { thread: thread(), existingRoles: [["PARENT"], ["TEACHER"]] as const };

  it("lets the office bring in another member of staff", () => {
    const check = canBeAddedToThread({
      candidate: accountant(),
      addedBy: principal(),
      thread: base.thread,
      existingRoles: [["PARENT"], ["TEACHER"]],
    });
    expect(check.allowed).toBe(true);
  });

  it("does not let a teacher bring anyone in", () => {
    const check = canBeAddedToThread({
      candidate: accountant(),
      addedBy: teacher(),
      thread: base.thread,
      existingRoles: [["PARENT"], ["TEACHER"]],
    });
    expect(check.reason).toMatch(/Only the office/);
  });

  it("never puts two parents in one conversation", () => {
    const check = canBeAddedToThread({
      candidate: parent({ userId: "u-second-parent" }),
      addedBy: principal(),
      thread: base.thread,
      existingRoles: [["PARENT"], ["TEACHER"]],
    });
    expect(check.reason).toMatch(/never holds two parents/);
  });

  it("allows a parent into a staff-only conversation", () => {
    const check = canBeAddedToThread({
      candidate: parent(),
      addedBy: principal(),
      thread: base.thread,
      existingRoles: [["TEACHER"], ["ADMIN"]],
    });
    expect(check.allowed).toBe(true);
  });

  it("refuses a student", () => {
    const check = canBeAddedToThread({
      candidate: student(),
      addedBy: principal(),
      thread: base.thread,
      existingRoles: [["TEACHER"]],
    });
    expect(check.allowed).toBe(false);
  });

  it("refuses a member of staff who has left", () => {
    const check = canBeAddedToThread({
      candidate: teacher({ userId: "u-gone", isActiveStaff: false }),
      addedBy: principal(),
      thread: base.thread,
      existingRoles: [["TEACHER"]],
    });
    expect(check.reason).toMatch(/has left the school/);
  });

  it("refuses a closed conversation", () => {
    const check = canBeAddedToThread({
      candidate: accountant(),
      addedBy: principal(),
      thread: thread({ closedAt: new Date() }),
      existingRoles: [["TEACHER"]],
    });
    expect(check.reason).toMatch(/closed/);
  });
});
