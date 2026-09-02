import { z } from "zod";
import { getMarksSheet } from "@/lib/queries/exams";
import { requireMobileRole, TEACHING, hasRole, OFFICE } from "@/lib/mobile/session";
import { saveMarksForActor, isClassTeacherOf, isSubjectTeacherOf } from "@/lib/mobile/mutations/exams";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ examId: string }> };

export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const { examId } = await params;

  const sheet = await getMarksSheet(actor.schoolId, examId);
  if (!sheet) return apiError(404, "not_found", "That exam is not in this school.");

  const canEdit =
    hasRole(actor, ...OFFICE) ||
    (await isClassTeacherOf(actor, sheet.exam.classId)) ||
    (await isSubjectTeacherOf(actor, sheet.exam.classId, sheet.exam.subjectId));
  return apiOk({ ...sheet, exam: { ...sheet.exam, canEdit } });
});

const EntrySchema = z.object({
  studentId: z.string().min(1),
  marks: z.number().nullable(),
  isAbsent: z.boolean(),
});

const Body = z.object({
  entries: z.array(EntrySchema).min(1),
});

/** Mirrors src/app/app/exams/actions.ts::saveMarks. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const { examId } = await params;
  const input = Body.parse(await req.json());

  const result = await saveMarksForActor(actor, examId, input.entries);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ entered: result.entered });
});
