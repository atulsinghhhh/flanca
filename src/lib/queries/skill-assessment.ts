import { db } from "@/lib/db";
import { summariseAttendance } from "@/lib/core/attendance-core";

/**
 * Pre-primary (Nursery/LKG/UKG) report cards. No exams, no marks — a rating
 * per skill area per term instead. Skill areas are the Subject rows these
 * classes already have (English, Numbers, Rhymes, ...); there is no separate
 * taxonomy to keep in sync.
 */

export const SKILL_RATING_LABEL: Record<string, string> = {
  BEGINNING: "Beginning",
  DEVELOPING: "Developing",
  PROFICIENT: "Proficient",
};

/** Is this class graded holistically rather than examined? Sequence 0/1/2 = Nursery/LKG/UKG. */
export function isHolisticClass(sequenceOrder: number): boolean {
  return sequenceOrder < 3;
}

/** One class's skill areas for a term, with how many students are rated so far — the holistic equivalent of getTermDetail's exams list. */
export async function getSkillTermDetail(schoolId: string, examTermId: string) {
  const term = await db.examTerm.findFirst({
    where: { id: examTermId, schoolId },
    include: { class: { select: { id: true, name: true, sequenceOrder: true } } },
  });
  if (!term?.classId) return null;

  const [subjects, strength, ratings] = await Promise.all([
    db.subject.findMany({
      where: { schoolId, classId: term.classId, isCoScholastic: false },
      orderBy: { name: "asc" },
    }),
    db.student.count({ where: { schoolId, classId: term.classId, status: "ACTIVE" } }),
    db.skillAssessment.groupBy({ by: ["subjectId"], where: { schoolId, examTermId }, _count: true }),
  ]);

  const ratedBySubject = new Map(ratings.map((r) => [r.subjectId, r._count]));

  return {
    termId: term.id,
    termName: term.name,
    classId: term.classId,
    className: term.class?.name ?? "—",
    strength,
    isPublished: term.isPublished,
    skillAreas: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      rated: ratedBySubject.get(s.id) ?? 0,
      expected: strength,
    })),
  };
}

/** One skill area's rating sheet for a term — the holistic equivalent of getMarksSheet. */
export async function getSkillSheet(schoolId: string, examTermId: string, subjectId: string) {
  const [term, subject] = await Promise.all([
    db.examTerm.findFirst({
      where: { id: examTermId, schoolId },
      select: { id: true, name: true, classId: true, isPublished: true, class: { select: { name: true } } },
    }),
    db.subject.findFirst({ where: { id: subjectId, schoolId }, select: { id: true, name: true, classId: true } }),
  ]);
  if (!term?.classId || !subject || subject.classId !== term.classId) return null;

  const [students, ratings] = await Promise.all([
    db.student.findMany({
      where: { schoolId, classId: term.classId, status: "ACTIVE" },
      orderBy: [{ section: { name: "asc" } }, { rollNumber: "asc" }, { name: "asc" }],
      select: { id: true, name: true, rollNumber: true, admissionNumber: true, section: { select: { name: true } } },
    }),
    db.skillAssessment.findMany({ where: { schoolId, examTermId, subjectId }, select: { studentId: true, rating: true } }),
  ]);
  const byStudent = new Map(ratings.map((r) => [r.studentId, r.rating]));

  return {
    examTerm: { id: term.id, name: term.name, isPublished: term.isPublished },
    subject: { id: subject.id, name: subject.name },
    className: term.class?.name ?? "—",
    classId: term.classId,
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      rollNumber: s.rollNumber,
      admissionNumber: s.admissionNumber,
      sectionName: s.section?.name ?? "",
      rating: byStudent.get(s.id) ?? null,
    })),
  };
}

export type HolisticReportRow = {
  studentId: string;
  name: string;
  rollNumber: number | null;
  sectionName: string;
  skills: Array<{ skillArea: string; rating: string | null }>;
  pending: boolean;
  attendancePercentBp: number;
};

/** Build a whole class's holistic report cards in one pass, mirroring buildClassReports' "one action per class" contract. */
export async function buildHolisticClassReport(
  schoolId: string,
  termId: string,
): Promise<{
  term: { id: string; name: string; className: string; classId: string; isPublished: boolean; resultDate: Date | null };
  rows: HolisticReportRow[];
} | null> {
  const term = await db.examTerm.findFirst({
    where: { id: termId, schoolId },
    include: { class: { select: { id: true, name: true } } },
  });
  if (!term?.classId) return null;

  const [students, subjects, ratings, attendance] = await Promise.all([
    db.student.findMany({
      where: { schoolId, classId: term.classId, status: "ACTIVE" },
      orderBy: [{ section: { name: "asc" } }, { rollNumber: "asc" }],
      select: { id: true, name: true, rollNumber: true, section: { select: { name: true } } },
    }),
    db.subject.findMany({ where: { schoolId, classId: term.classId, isCoScholastic: false }, orderBy: { name: "asc" } }),
    db.skillAssessment.findMany({ where: { schoolId, examTermId: termId } }),
    db.attendance.findMany({
      where: { schoolId, classId: term.classId, studentId: { not: null } },
      select: { studentId: true, status: true, date: true },
    }),
  ]);

  const ratingKey = (subjectId: string, studentId: string) => `${subjectId}:${studentId}`;
  const ratingMap = new Map(ratings.map((r) => [ratingKey(r.subjectId, r.studentId), r.rating]));

  const attByStudent = new Map<string, Array<{ date: Date; status: string }>>();
  for (const a of attendance) {
    const list = attByStudent.get(a.studentId!) ?? [];
    list.push({ date: a.date, status: a.status });
    attByStudent.set(a.studentId!, list);
  }

  const rows: HolisticReportRow[] = students.map((s) => {
    const skills = subjects.map((sub) => ({
      skillArea: sub.name,
      rating: ratingMap.get(ratingKey(sub.id, s.id)) ?? null,
    }));
    const att = summariseAttendance((attByStudent.get(s.id) ?? []) as never);
    return {
      studentId: s.id,
      name: s.name,
      rollNumber: s.rollNumber,
      sectionName: s.section?.name ?? "",
      skills,
      pending: skills.some((k) => k.rating == null),
      attendancePercentBp: att.percentBp,
    };
  });

  return {
    term: {
      id: term.id,
      name: term.name,
      className: term.class?.name ?? "—",
      classId: term.classId,
      isPublished: term.isPublished,
      resultDate: term.resultDate,
    },
    rows,
  };
}
