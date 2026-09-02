import { db } from "@/lib/db";
import type { Actor } from "@/lib/session";
import { CBSE_8_POINT, computeReport, gradeFor, percentBp, rankStudents, type GradeBand, type SubjectMark } from "@/lib/core/grading-core";
import { summariseAttendance } from "@/lib/core/attendance-core";
import { isHolisticClass } from "@/lib/queries/skill-assessment";

/**
 * What a non-office actor may see across exams/marks: whole classes they are
 * class teacher of, plus (for classes they are not class teacher of) only the
 * subjects they actually teach there, per the timetable — never StaffSubject,
 * which carries no class/section scoping.
 */
export type ExamScope =
  | { isOffice: true }
  | { isOffice: false; classTeacherClassIds: Set<string>; subjectsByClass: Map<string, Set<string>> };

export async function getExamScope(actor: Actor, isOffice: boolean): Promise<ExamScope> {
  if (isOffice) return { isOffice: true };

  const [sections, entries] = await Promise.all([
    db.section.findMany({
      where: { schoolId: actor.schoolId, classTeacherId: actor.id },
      select: { classId: true },
    }),
    db.timetableEntry.findMany({
      where: { schoolId: actor.schoolId, staff: { userId: actor.id }, subjectId: { not: null } },
      select: { classId: true, subjectId: true },
      distinct: ["classId", "subjectId"],
    }),
  ]);

  const classTeacherClassIds = new Set(sections.map((s) => s.classId).filter((id): id is string => id != null));
  const subjectsByClass = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.classId || !e.subjectId) continue;
    const set = subjectsByClass.get(e.classId) ?? new Set<string>();
    set.add(e.subjectId);
    subjectsByClass.set(e.classId, set);
  }
  return { isOffice: false, classTeacherClassIds, subjectsByClass };
}

/**
 * Report cards are narrower than exams/marks: only the class's own class
 * teacher may see its analysis, never a subject-only teacher (unlike
 * saveMarks/getMarksSheet, where a subject teacher legitimately needs their
 * own paper). Reuses ExamScope with an empty subjectsByClass so getExamTerms/
 * getTermDetail's existing filtering does the rest.
 */
export async function getReportCardScope(actor: Actor, isOffice: boolean): Promise<ExamScope> {
  if (isOffice) return { isOffice: true };
  const sections = await db.section.findMany({
    where: { schoolId: actor.schoolId, classTeacherId: actor.id },
    select: { classId: true },
  });
  const classTeacherClassIds = new Set(sections.map((s) => s.classId).filter((id): id is string => id != null));
  return { isOffice: false, classTeacherClassIds, subjectsByClass: new Map() };
}

function scopedClassIds(scope: ExamScope): string[] | undefined {
  if (scope.isOffice) return undefined;
  return [...new Set([...scope.classTeacherClassIds, ...scope.subjectsByClass.keys()])];
}

/** A class teacher sees every exam in their own class; a subject-only teacher sees only exams for subjects they teach there. */
function visibleExams<T extends { subjectId: string | null }>(scope: ExamScope, classId: string | null, exams: T[]): T[] {
  if (scope.isOffice) return exams;
  if (!classId) return [];
  if (scope.classTeacherClassIds.has(classId)) return exams;
  const subjects = scope.subjectsByClass.get(classId);
  if (!subjects) return [];
  return exams.filter((e) => e.subjectId != null && subjects.has(e.subjectId));
}

/** Terms with how much marks entry is actually finished — the principal's real question. */
export async function getExamTerms(schoolId: string, scope: ExamScope = { isOffice: true }) {
  const onlyClassIds = scopedClassIds(scope);
  const terms = await db.examTerm.findMany({
    where: { schoolId, ...(onlyClassIds ? { classId: { in: onlyClassIds } } : {}) },
    orderBy: [{ sequenceOrder: "asc" }, { class: { sequenceOrder: "asc" } }],
    include: {
      class: { select: { id: true, name: true, sequenceOrder: true } },
      exams: {
        include: {
          subject: { select: { name: true } },
          _count: { select: { results: true } },
        },
      },
    },
  });

  // One term name usually spans every class ("Unit Test 1" for each), so group by
  // name to give the office one row per exam cycle rather than thirteen.
  const groups = new Map<
    string,
    {
      name: string;
      sequenceOrder: number;
      isPublished: boolean;
      startDate: Date | null;
      endDate: Date | null;
      classCount: number;
      examCount: number;
      expected: number;
      entered: number;
      termIds: string[];
    }
  >();

  const strengths = await db.student.groupBy({
    by: ["classId"],
    where: { schoolId, status: "ACTIVE" },
    _count: true,
  });
  const strengthByClass = new Map(strengths.map((s) => [s.classId, s._count]));

  for (const t of terms) {
    const exams = visibleExams(scope, t.classId, t.exams);
    if (exams.length === 0 && !(!scope.isOffice && scope.classTeacherClassIds.has(t.classId ?? ""))) continue;

    const g = groups.get(t.name) ?? {
      name: t.name,
      sequenceOrder: t.sequenceOrder,
      isPublished: true,
      startDate: t.startDate,
      endDate: t.endDate,
      classCount: 0,
      examCount: 0,
      expected: 0,
      entered: 0,
      termIds: [],
    };

    g.classCount += 1;
    g.examCount += exams.length;
    g.termIds.push(t.id);
    g.isPublished = g.isPublished && t.isPublished;
    if (t.startDate && (!g.startDate || t.startDate < g.startDate)) g.startDate = t.startDate;
    if (t.endDate && (!g.endDate || t.endDate > g.endDate)) g.endDate = t.endDate;

    const strength = strengthByClass.get(t.classId ?? "") ?? 0;
    g.expected += strength * exams.length;
    g.entered += exams.reduce((a, e) => a + e._count.results, 0);

    groups.set(t.name, g);
  }

  return [...groups.values()].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
}

/** Every exam in a term cycle, with entry progress, so a teacher sees what is left. */
export async function getTermDetail(schoolId: string, termName: string, scope: ExamScope = { isOffice: true }) {
  const onlyClassIds = scopedClassIds(scope);
  const terms = await db.examTerm.findMany({
    where: { schoolId, name: termName, ...(onlyClassIds ? { classId: { in: onlyClassIds } } : {}) },
    orderBy: { class: { sequenceOrder: "asc" } },
    include: {
      class: { select: { id: true, name: true, sequenceOrder: true } },
      exams: {
        orderBy: [{ examDate: "asc" }, { subject: { name: "asc" } }],
        include: {
          subject: { select: { id: true, name: true } },
          _count: { select: { results: true } },
          duties: { select: { staffId: true, staff: { select: { user: { select: { name: true } } } } } },
        },
      },
    },
  });
  if (terms.length === 0) return null;

  const strengths = await db.student.groupBy({
    by: ["classId"],
    where: { schoolId, status: "ACTIVE" },
    _count: true,
  });
  const strengthByClass = new Map(strengths.map((s) => [s.classId, s._count]));

  return {
    name: termName,
    isPublished: terms.every((t) => t.isPublished),
    weightage: terms[0].weightage,
    classes: terms.map((t) => ({
      termId: t.id,
      classId: t.classId,
      className: t.class?.name ?? "—",
      isHolistic: isHolisticClass(t.class?.sequenceOrder ?? 99),
      strength: strengthByClass.get(t.classId ?? "") ?? 0,
      resultDate: t.resultDate,
      isPublished: t.isPublished,
      exams: visibleExams(scope, t.classId, t.exams).map((e) => ({
        id: e.id,
        subjectName: e.subject?.name ?? e.name ?? "—",
        examDate: e.examDate,
        maxMarks: e.maxMarks,
        passMarks: e.passMarks,
        roomNo: e.roomNo,
        entered: e._count.results,
        expected: strengthByClass.get(t.classId ?? "") ?? 0,
        duties: e.duties.map((d) => ({ staffId: d.staffId, staffName: d.staff.user.name })),
      })),
    })),
  };
}

/** The marks-entry sheet: one exam, one class, every student in roll order. */
export async function getMarksSheet(schoolId: string, examId: string) {
  const exam = await db.exam.findFirst({
    where: { id: examId, schoolId },
    include: {
      subject: { select: { name: true } },
      examTerm: { select: { id: true, name: true, isPublished: true } },
      class: { select: { id: true, name: true } },
    },
  });
  if (!exam) return null;

  const [students, results] = await Promise.all([
    db.student.findMany({
      where: { schoolId, classId: exam.classId ?? undefined, status: "ACTIVE" },
      orderBy: [{ section: { name: "asc" } }, { rollNumber: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        rollNumber: true,
        admissionNumber: true,
        section: { select: { name: true } },
      },
    }),
    db.examResult.findMany({ where: { examId }, select: { studentId: true, marks: true, isAbsent: true, grade: true } }),
  ]);

  const byStudent = new Map(results.map((r) => [r.studentId, r]));

  return {
    exam: {
      id: exam.id,
      classId: exam.classId,
      subjectId: exam.subjectId,
      subjectName: exam.subject?.name ?? exam.name ?? "—",
      className: exam.class?.name ?? "—",
      termName: exam.examTerm.name,
      termId: exam.examTerm.id,
      isPublished: exam.examTerm.isPublished,
      maxMarks: exam.maxMarks,
      passMarks: exam.passMarks,
      examDate: exam.examDate,
    },
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      rollNumber: s.rollNumber,
      sectionName: s.section?.name ?? "",
      marks: byStudent.get(s.id)?.marks ?? null,
      isAbsent: byStudent.get(s.id)?.isAbsent ?? false,
    })),
  };
}

export type ReportRow = {
  studentId: string;
  name: string;
  rollNumber: number | null;
  sectionName: string;
  subjects: SubjectMark[];
  totals: ReturnType<typeof computeReport>;
  rank: number;
  attendancePercentBp: number;
};

/**
 * Build a whole class's report cards in one pass — the "one action per class"
 * contract. Ranks are computed across the class with ties sharing a rank.
 */
export async function buildClassReports(
  schoolId: string,
  termId: string,
  bands: GradeBand[] = CBSE_8_POINT,
): Promise<{
  term: { id: string; name: string; className: string; classId: string; isPublished: boolean; resultDate: Date | null };
  rows: ReportRow[];
} | null> {
  const term = await db.examTerm.findFirst({
    where: { id: termId, schoolId },
    include: { class: { select: { id: true, name: true } } },
  });
  if (!term?.classId) return null;

  const [students, exams, results, attendance] = await Promise.all([
    db.student.findMany({
      where: { schoolId, classId: term.classId, status: "ACTIVE" },
      orderBy: [{ section: { name: "asc" } }, { rollNumber: "asc" }],
      select: { id: true, name: true, rollNumber: true, section: { select: { name: true } } },
    }),
    db.exam.findMany({
      where: { schoolId, examTermId: term.id },
      include: { subject: { select: { name: true } } },
      orderBy: { subject: { name: "asc" } },
    }),
    db.examResult.findMany({ where: { exam: { examTermId: term.id } } }),
    db.attendance.findMany({
      where: { schoolId, classId: term.classId, studentId: { not: null } },
      select: { studentId: true, status: true, date: true },
    }),
  ]);

  const resultKey = (examId: string, studentId: string) => `${examId}:${studentId}`;
  const resultMap = new Map(results.map((r) => [resultKey(r.examId, r.studentId), r]));

  const attByStudent = new Map<string, Array<{ date: Date; status: string }>>();
  for (const a of attendance) {
    const list = attByStudent.get(a.studentId!) ?? [];
    list.push({ date: a.date, status: a.status });
    attByStudent.set(a.studentId!, list);
  }

  const built = students.map((s) => {
    const subjects: SubjectMark[] = exams.map((e) => {
      const r = resultMap.get(resultKey(e.id, s.id));
      return {
        subject: e.subject?.name ?? e.name ?? "—",
        maxMarks: e.maxMarks,
        marks: r?.marks ?? null,
        isAbsent: r?.isAbsent ?? false,
        passMarks: e.passMarks,
      };
    });

    const totals = computeReport(subjects, bands);
    const att = summariseAttendance((attByStudent.get(s.id) ?? []) as never);

    return {
      studentId: s.id,
      name: s.name,
      rollNumber: s.rollNumber,
      sectionName: s.section?.name ?? "",
      subjects,
      totals,
      percentBp: totals.percentBp,
      attendancePercentBp: att.percentBp,
    };
  });

  const ranked = rankStudents(built.map((b) => ({ ...b, id: b.studentId })));

  return {
    term: {
      id: term.id,
      name: term.name,
      className: term.class?.name ?? "—",
      classId: term.classId,
      isPublished: term.isPublished,
      resultDate: term.resultDate,
    },
    rows: ranked
      .sort((a, b) => (a.rollNumber ?? 999) - (b.rollNumber ?? 999))
      .map(({ id: _id, percentBp: _p, ...rest }) => rest as ReportRow),
  };
}

/**
 * The date sheet a parent or student actually needs: what's coming up for
 * their own class, subject/date/room, with no marks or entry-progress in it —
 * that part is staff-only. Dates are visible as soon as they're scheduled,
 * not gated behind ExamTerm.isPublished — a school announces the date sheet
 * before the exam happens, not after results are marked.
 */
export async function getUpcomingExams(schoolId: string, classId: string, from = new Date()) {
  const exams = await db.exam.findMany({
    where: { schoolId, classId, examDate: { gte: from } },
    orderBy: [{ examDate: "asc" }, { subject: { name: "asc" } }],
    include: {
      subject: { select: { name: true } },
      examTerm: { select: { name: true } },
    },
    take: 12,
  });

  return exams.map((e) => ({
    id: e.id,
    subjectName: e.subject?.name ?? e.name ?? "—",
    termName: e.examTerm.name,
    examDate: e.examDate,
    startTime: e.startTime,
    durationMins: e.durationMins,
    roomNo: e.roomNo,
  }));
}

/** Result analysis a principal actually uses: subject-wise pass rates and toppers. */
export async function getResultAnalysis(schoolId: string, termId: string) {
  const built = await buildClassReports(schoolId, termId);
  if (!built) return null;

  const bySubject = new Map<string, { subject: string; appeared: number; passed: number; total: number; max: number; highest: number }>();

  for (const row of built.rows) {
    for (const s of row.subjects) {
      if (s.marks == null && !s.isAbsent) continue;
      const scored = s.isAbsent ? 0 : (s.marks ?? 0);
      const pass = s.passMarks ?? Math.round(s.maxMarks * 0.33);
      const acc = bySubject.get(s.subject) ?? {
        subject: s.subject, appeared: 0, passed: 0, total: 0, max: 0, highest: 0,
      };
      acc.appeared += 1;
      if (scored >= pass) acc.passed += 1;
      acc.total += scored;
      acc.max += s.maxMarks;
      acc.highest = Math.max(acc.highest, scored);
      bySubject.set(s.subject, acc);
    }
  }

  const toppers = [...built.rows]
    .filter((r) => r.totals.result !== "PENDING")
    .sort((a, b) => b.totals.percentBp - a.totals.percentBp)
    .slice(0, 5);

  const complete = built.rows.filter((r) => r.totals.result !== "PENDING");

  return {
    term: built.term,
    strength: built.rows.length,
    entered: complete.length,
    passed: complete.filter((r) => r.totals.result === "PASS").length,
    failed: complete.filter((r) => r.totals.result === "FAIL").length,
    classAverageBp:
      complete.length > 0
        ? Math.round(complete.reduce((a, r) => a + r.totals.percentBp, 0) / complete.length)
        : 0,
    subjects: [...bySubject.values()]
      .map((s) => ({
        ...s,
        passRateBp: s.appeared > 0 ? Math.round((s.passed / s.appeared) * 10000) : 0,
        averageBp: percentBp(s.total, s.max),
        highestGrade: gradeFor(percentBp(s.highest, s.max / Math.max(1, s.appeared)))?.grade ?? null,
      }))
      .sort((a, b) => a.passRateBp - b.passRateBp),
    toppers,
  };
}
