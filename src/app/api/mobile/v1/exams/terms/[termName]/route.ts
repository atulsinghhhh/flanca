import { db } from "@/lib/db";
import { requireMobileActor, hasRole, OFFICE, TEACHING } from "@/lib/mobile/session";
import { getExamScope, getTermDetail } from "@/lib/queries/exams";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ termName: string }> };

type NarrowedTerm = {
  termName: string;
  weightage: number | null;
  classId: string | null;
  className: string;
  resultDate: Date | null;
  isPublished: boolean;
  exams: Array<{
    id: string;
    subjectName: string;
    examDate: Date | null;
    maxMarks: number;
    passMarks: number;
    marks: number | null;
    isAbsent: boolean;
    grade: string | null;
  }>;
};

/**
 * One student's own row inside a term's detail: same class/exam shape
 * getTermDetail already returns, but with actual marks joined in instead of
 * just entered/expected counts, and only for that one student.
 *
 * Marks are gated by ExamResult.state === "PUBLISHED" — the exact flag
 * src/lib/queries/role-home.ts's getStudentHome already filters a student's
 * own exam results by, and the one src/app/app/exams/actions.ts flips (in the
 * same transaction as ExamTerm.isPublished) when a term's report cards are
 * published. An unpublished exam therefore comes back with every mark null,
 * never a leaked in-progress entry.
 */
async function narrowForStudent(
  schoolId: string,
  termName: string,
  studentId: string,
  classId: string | null,
): Promise<NarrowedTerm | null> {
  const detail = await getTermDetail(schoolId, termName);
  if (!detail) return null;

  const classEntry = detail.classes.find((c) => c.classId === classId);
  if (!classEntry) return null;

  const examIds = classEntry.exams.map((e) => e.id);
  const results = examIds.length
    ? await db.examResult.findMany({
        where: { studentId, examId: { in: examIds }, state: "PUBLISHED" },
        select: { examId: true, marks: true, isAbsent: true, grade: true },
      })
    : [];
  const byExam = new Map(results.map((r) => [r.examId, r]));

  return {
    termName: detail.name,
    weightage: detail.weightage,
    classId: classEntry.classId,
    className: classEntry.className,
    resultDate: classEntry.resultDate,
    isPublished: classEntry.isPublished,
    exams: classEntry.exams.map((e) => ({
      id: e.id,
      subjectName: e.subjectName,
      examDate: e.examDate,
      maxMarks: e.maxMarks,
      passMarks: e.passMarks,
      marks: byExam.get(e.id)?.marks ?? null,
      isAbsent: byExam.get(e.id)?.isAbsent ?? false,
      grade: byExam.get(e.id)?.grade ?? null,
    })),
  };
}

/**
 * One exam cycle's detail. Mirrors src/app/app/exams/term/[name]/page.tsx.
 *
 * OFFICE gets the same full per-class entry-progress view the web page shows
 * (every class in the cycle, every paper, entered/expected counts) — no
 * student-level marks. TEACHING (non-office) gets the same shape narrowed to
 * their own class/subjects, exactly like the web page.
 *
 * STUDENT gets only their own class's row, narrowed to their own marks.
 * PARENT gets the same narrowed shape once per linked child, each tagged
 * with which child it belongs to.
 */
export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileActor(req);
  const { termName: raw } = await params;
  const termName = decodeURIComponent(raw);

  if (hasRole(actor, ...OFFICE, ...TEACHING)) {
    const scope = await getExamScope(actor, hasRole(actor, ...OFFICE));
    const detail = await getTermDetail(actor.schoolId, termName, scope);
    if (!detail) return apiError(404, "not_found", "No such exam term.");
    return apiOk({ role: "STAFF", term: detail });
  }

  const student = await db.student.findFirst({
    where: { schoolId: actor.schoolId, userId: actor.id },
    select: { id: true, classId: true },
  });
  if (student) {
    const term = await narrowForStudent(actor.schoolId, termName, student.id, student.classId);
    if (!term) return apiError(404, "not_found", "No such exam term for your class.");
    return apiOk({ role: "STUDENT", term });
  }

  if (hasRole(actor, "PARENT")) {
    const links = await db.parentLink.findMany({
      where: { schoolId: actor.schoolId, userId: actor.id },
      select: { student: { select: { id: true, name: true, classId: true } } },
    });

    const children = await Promise.all(
      links.map(async (l) => ({
        studentId: l.student.id,
        studentName: l.student.name,
        term: await narrowForStudent(actor.schoolId, termName, l.student.id, l.student.classId),
      })),
    );
    return apiOk({ role: "PARENT", children });
  }

  return apiOk({ role: "NONE", term: null });
});
