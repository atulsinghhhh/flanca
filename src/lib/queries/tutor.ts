import { db } from "@/lib/db";
import {
  fetchCohort,
  fetchSeats,
  fetchStudent,
  tutorConfig,
  type Cohort,
  type TutorResult,
} from "@/lib/tutor/client";
import { onlyThese, rosterFor, tutorClassLevelOf, type RosterIntent, type TutorChild } from "@/lib/core/tutor-core";

/**
 * Everything Flanca asks the tutor, in one place.
 *
 * The pages do not call the client directly. That is deliberate: the panels are
 * spread across a teacher's home, a parent's home, a student profile and the
 * office, and the rule that a parent sees one child and a class teacher sees one
 * section has to be enforced where it can be read and tested, not in four
 * components that each looked correct on the day they were written.
 */

/** Is the tutor bought and configured for this deployment? */
export function tutorOn(): boolean {
  return tutorConfig() !== null;
}

/* ─────────────────────────── the roster, going out ─────────────────────── */

export interface RosterScope {
  label: string;
  classId: string | null;
  /** What the tutor calls this class, or null if it teaches no such class. */
  classLevel: string | null;
  intent: RosterIntent;
  /** Active children of this class that the tutor cannot teach, with the reason. */
  outOfRange: number;
}

/**
 * What a push would contain, for one class or for the whole school.
 *
 * Reads Flanca's own roster and the tutor's current membership, then hands both
 * to the pure rule. Note that children outside Class 3–12 are *counted* here and
 * still sent: the tutor refuses them by name with a reason, and a clerk who is
 * told "twenty were refused, here is why" is better served than one whose file
 * was silently filtered on the way out.
 */
export async function rosterScopeFor(params: {
  schoolId: string;
  classId: string | null;
  known: ReadonlySet<string>;
}): Promise<RosterScope> {
  const students = await db.student.findMany({
    where: {
      schoolId: params.schoolId,
      ...(params.classId ? { classId: params.classId } : {}),
    },
    select: {
      admissionNumber: true,
      name: true,
      status: true,
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
    orderBy: { admissionNumber: "asc" },
  });

  const intent = rosterFor({
    students: students.map((s) => ({
      admissionNumber: s.admissionNumber,
      name: s.name,
      className: s.class?.name ?? null,
      section: s.section?.name ?? null,
      status: s.status,
    })),
    known: params.known,
  });

  const outOfRange = students.filter(
    (s) => s.status === "ACTIVE" && tutorClassLevelOf(s.class?.name ?? null) === null,
  ).length;

  const label = params.classId
    ? (students[0]?.class?.name ?? "This class")
    : "The whole school";

  return {
    label,
    classId: params.classId,
    classLevel: params.classId ? tutorClassLevelOf(students[0]?.class?.name ?? null) : null,
    intent,
    outOfRange,
  };
}

/**
 * Who the tutor already holds for this school.
 *
 * One request for the whole school rather than one per class, because the answer
 * feeds the withdrawal rule and a partial answer there would look exactly like a
 * child who had left. When the tutor cannot be reached the set is empty AND the
 * result says so — a caller must not read "nobody is provisioned" out of "we
 * could not ask", which would turn a network blip into six hundred withdrawals.
 */
export async function tutorMembership(): Promise<{
  refs: Set<string>;
  result: TutorResult<Cohort>;
}> {
  const result = await fetchCohort({});
  if (result.state !== "ok") return { refs: new Set(), result };
  return {
    refs: new Set(result.data.students.map((s) => s.admissionNumber).filter((r): r is string => Boolean(r))),
    result,
  };
}

export async function tutorSeats() {
  return fetchSeats();
}

/* ─────────────────────────── what comes back ─────────────────────── */

/**
 * One class teacher's section, as the tutor sees it.
 *
 * Two narrowings, in this order: the tutor is asked for one class level, and the
 * answer is then filtered to the admission numbers in her section. Both are
 * needed — the first keeps the request small, the second is the one that matters,
 * because the tutor has never heard of sections and would happily hand back 7 B.
 */
export async function sectionCohort(params: {
  schoolId: string;
  sectionId: string;
}): Promise<{ result: TutorResult<Cohort>; children: TutorChild[]; className: string; taught: boolean }> {
  const section = await db.section.findFirst({
    where: { id: params.sectionId, schoolId: params.schoolId },
    select: {
      name: true,
      class: { select: { name: true } },
      students: { where: { status: "ACTIVE" }, select: { admissionNumber: true } },
    },
  });

  const className = section ? `${section.class.name} ${section.name}` : "—";
  const classLevel = tutorClassLevelOf(section?.class.name ?? null);
  if (!section || classLevel === null) {
    return { result: { state: "off" }, children: [], className, taught: false };
  }

  const result = await fetchCohort({ classLevel });
  if (result.state !== "ok") return { result, children: [], className, taught: true };

  const mine = new Set(section.students.map((s) => s.admissionNumber));
  return { result, children: onlyThese(result.data.students, mine), className, taught: true };
}

/**
 * One child, for a parent — and only a child that parent is linked to.
 *
 * The link is checked against Flanca's own `ParentLink` before the tutor is asked
 * anything at all. The tutor cannot make this check: it authenticates the school's
 * system, not the person holding the phone, and it says so in its own comments.
 * Which means this function is the whole of the guarantee.
 */
export async function childForParent(params: {
  schoolId: string;
  parentUserId: string;
  studentId: string;
}): Promise<{ result: TutorResult<{ school: string; student: TutorChild }>; name: string } | null> {
  const link = await db.parentLink.findFirst({
    where: { schoolId: params.schoolId, userId: params.parentUserId, studentId: params.studentId },
    select: { student: { select: { name: true, admissionNumber: true, status: true, class: { select: { name: true } } } } },
  });
  if (!link) return null;
  if (tutorClassLevelOf(link.student.class?.name ?? null) === null) return null;

  return {
    result: await fetchStudent(link.student.admissionNumber),
    name: link.student.name,
  };
}

/**
 * One child, for the office or a class teacher looking at a profile.
 *
 * Role is checked by the page (`OFFICE`, or the teacher who owns the section);
 * what is enforced here is only that the child belongs to this school.
 */
export async function childForSchool(params: {
  schoolId: string;
  studentId: string;
}): Promise<{ result: TutorResult<{ school: string; student: TutorChild }>; name: string } | null> {
  const student = await db.student.findFirst({
    where: { id: params.studentId, schoolId: params.schoolId },
    select: { name: true, admissionNumber: true, class: { select: { name: true } } },
  });
  if (!student) return null;
  if (tutorClassLevelOf(student.class?.name ?? null) === null) return null;

  return { result: await fetchStudent(student.admissionNumber), name: student.name };
}

/**
 * The admission number for a one-click entry, with the authority to use it.
 *
 * Returns null rather than throwing, and null covers every refusal on purpose:
 * no such child, not this parent's child, not this school. A caller that
 * distinguished them would be a way to ask whether a given admission number
 * exists at a school, which is the same reasoning the tutor's own invite endpoint
 * uses when it refuses to say whether an address has a child.
 */
export async function admissionNumberForEntry(params: {
  schoolId: string;
  actorId: string;
  roles: string[];
  studentId: string;
}): Promise<{ admissionNumber: string; name: string } | null> {
  const office = ["OWNER", "PRINCIPAL", "ADMIN"].some((r) => params.roles.includes(r));

  const student = await db.student.findFirst({
    where: {
      id: params.studentId,
      schoolId: params.schoolId,
      status: "ACTIVE",
      ...(office
        ? {}
        : {
            OR: [
              // The child themselves.
              { userId: params.actorId },
              // A parent linked to the child.
              { parentLinks: { some: { userId: params.actorId } } },
              // The class teacher of the child's section.
              { section: { classTeacherId: params.actorId } },
            ],
          }),
    },
    select: { admissionNumber: true, name: true, class: { select: { name: true } } },
  });
  if (!student) return null;
  if (tutorClassLevelOf(student.class?.name ?? null) === null) return null;
  return { admissionNumber: student.admissionNumber, name: student.name };
}
