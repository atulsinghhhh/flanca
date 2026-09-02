import { z } from "zod";
import { db } from "@/lib/db";
import { requireMobileActor, requireMobileRole, TEACHING } from "@/lib/mobile/session";
import { getChatPerson } from "@/lib/queries/chat";
import { canSetHomework, canSubmitHomework } from "@/lib/core/homework-core";
import { updateHomeworkForActor, deleteHomeworkForActor } from "@/lib/mobile/mutations/homework";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Detail. Mirrors src/app/app/homework/[id]/page.tsx's three views:
 *  - "manage" — the teacher who set it (or office) gets the whole class/section
 *    roster with each student's submission, same shape as ManageSection there.
 *  - "student" — the student it was set for gets their own submission and
 *    whether they may still hand it in, same as StudentSection.
 *  - "parent" — a parent gets their own children's submissions, same as
 *    ParentSection.
 *  - "status" — anyone else in the school just gets the lifecycle status.
 */
export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileActor(req);
  const { id } = await params;

  const hw = await db.homework.findFirst({
    where: { id, schoolId: actor.schoolId },
    include: {
      class: { select: { name: true } },
      section: { select: { id: true, name: true } },
      subject: { select: { name: true } },
      staff: { include: { user: { select: { name: true } } } },
    },
  });
  if (!hw) return apiError(404, "not_found", "That homework is not in this school.");

  const person = await getChatPerson(actor.schoolId, actor.id);
  const isOffice = Boolean(person?.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r)));
  const canManage = person
    ? canSetHomework({
        roles: person.roles,
        classTeacherOfSectionIds: person.classTeacherOfSectionIds,
        teachesSectionIds: person.teachesSectionIds,
        sectionId: hw.sectionId,
        isActiveStaff: person.isActiveStaff || isOffice,
      }).allowed
    : false;

  if (canManage) {
    const students = await db.student.findMany({
      where: { schoolId: actor.schoolId, classId: hw.classId, ...(hw.sectionId ? { sectionId: hw.sectionId } : {}), status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        admissionNumber: true,
        homeworkSubmissions: {
          where: { homeworkId: hw.id },
          select: { id: true, submittedAt: true, note: true, fileUrl: true, marks: true, feedback: true },
        },
      },
    });

    const roster = students.map((s) => {
      const sub = s.homeworkSubmissions[0] ?? null;
      return {
        studentId: s.id,
        name: s.name,
        admissionNumber: s.admissionNumber,
        submissionId: sub?.id ?? null,
        submittedAt: sub?.submittedAt ?? null,
        note: sub?.note ?? null,
        fileUrl: sub?.fileUrl ?? null,
        marks: sub?.marks ?? null,
        feedback: sub?.feedback ?? null,
      };
    });

    return apiOk({ view: "manage", homework: hw, roster });
  }

  const student = await db.student.findFirst({
    where: { schoolId: actor.schoolId, userId: actor.id },
    select: { id: true, classId: true, sectionId: true },
  });
  if (student) {
    const existing = await db.homeworkSubmission.findUnique({
      where: { homeworkId_studentId: { homeworkId: hw.id, studentId: student.id } },
      select: { submittedAt: true, note: true, fileUrl: true, marks: true, feedback: true },
    });

    const guard = canSubmitHomework({
      status: hw.status,
      studentSectionId: student.sectionId,
      homeworkSectionId: hw.sectionId,
      homeworkClassId: hw.classId,
      studentClassId: student.classId,
      alreadySubmitted: Boolean(existing),
    });

    return apiOk({
      view: "student",
      homework: hw,
      mine: existing ?? null,
      canSubmit: guard.allowed,
      whyNot: guard.reason,
    });
  }

  if (person?.roles.includes("PARENT")) {
    const links = await db.parentLink.findMany({
      where: { schoolId: actor.schoolId, userId: actor.id },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            classId: true,
            sectionId: true,
            homeworkSubmissions: {
              where: { homeworkId: hw.id },
              select: { submittedAt: true, marks: true, feedback: true },
            },
          },
        },
      },
    });

    const children = links
      .map((l) => l.student)
      .filter((s) => s.classId === hw.classId && (!hw.sectionId || s.sectionId === hw.sectionId))
      .map((s) => ({
        studentId: s.id,
        name: s.name,
        submission: s.homeworkSubmissions[0] ?? null,
      }));

    return apiOk({ view: "parent", homework: hw, children });
  }

  return apiOk({ view: "status", homework: hw });
});

const UpdateHomeworkBody = z.object({
  title: z.string().min(1),
  details: z.string().optional().nullable(),
  dueIso: z.string().optional().nullable(),
});

/** Mirrors src/app/app/homework/actions.ts::updateHomework. */
export const PATCH = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const { id } = await params;
  const input = UpdateHomeworkBody.parse(await req.json());

  const result = await updateHomeworkForActor(actor, id, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ messages: result.messages });
});

/** Mirrors src/app/app/homework/actions.ts::deleteHomework. */
export const DELETE = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const { id } = await params;

  const result = await deleteHomeworkForActor(actor, id);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ deleted: true });
});
