import { z } from "zod";
import { db } from "@/lib/db";
import { requireMobileActor, requireMobileRole, hasRole, TEACHING } from "@/lib/mobile/session";
import { getChatPerson } from "@/lib/queries/chat";
import { setHomeworkForActor } from "@/lib/mobile/mutations/homework";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const HOMEWORK_INCLUDE = {
  class: { select: { name: true } },
  section: { select: { name: true } },
  subject: { select: { name: true } },
  staff: { include: { user: { select: { name: true } } } },
  _count: { select: { submissions: true } },
} as const;

/**
 * Role-scoped list. Mirrors src/app/app/homework/page.tsx's data (same select,
 * same draft rule: a DRAFT is visible only to the office and the teacher who
 * wrote it), but scoped per role rather than the page's single browse-everything
 * list — that list is only reachable from the web nav by TEACHING roles, and a
 * student/parent on the app wants "what's due for my section", not the whole
 * school's homework. See getStudentHome/getTeacherHome in queries/role-home.ts
 * for the same scoping used on each role's home screen.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const classId = new URL(req.url).searchParams.get("classId") ?? undefined;

  const person = await getChatPerson(actor.schoolId, actor.id);
  const isOffice = Boolean(person?.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r)));

  if (isOffice) {
    const homework = await db.homework.findMany({
      where: { schoolId: actor.schoolId, ...(classId ? { classId } : {}) },
      orderBy: [{ dueOn: "asc" }, { assignedOn: "desc" }],
      take: 60,
      include: HOMEWORK_INCLUDE,
    });
    return apiOk({ role: "OFFICE", homework });
  }

  if (person?.staffId && hasRole(actor, "TEACHER")) {
    const homework = await db.homework.findMany({
      where: { schoolId: actor.schoolId, staffId: person.staffId, ...(classId ? { classId } : {}) },
      orderBy: [{ dueOn: "asc" }, { assignedOn: "desc" }],
      take: 60,
      include: HOMEWORK_INCLUDE,
    });
    return apiOk({ role: "TEACHER", homework });
  }

  const student = await db.student.findFirst({
    where: { schoolId: actor.schoolId, userId: actor.id },
    select: { id: true, classId: true, sectionId: true },
  });
  if (student) {
    const homework = await db.homework.findMany({
      where: {
        schoolId: actor.schoolId,
        classId: student.classId ?? undefined,
        OR: [{ sectionId: student.sectionId }, { sectionId: null }],
        status: { not: "DRAFT" },
      },
      orderBy: [{ dueOn: "asc" }, { assignedOn: "desc" }],
      take: 60,
      include: {
        ...HOMEWORK_INCLUDE,
        submissions: { where: { studentId: student.id }, select: { submittedAt: true, marks: true } },
      },
    });
    return apiOk({
      role: "STUDENT",
      homework: homework.map((h) => ({ ...h, mySubmission: h.submissions[0] ?? null, submissions: undefined })),
    });
  }

  if (hasRole(actor, "PARENT")) {
    const links = await db.parentLink.findMany({
      where: { schoolId: actor.schoolId, userId: actor.id },
      select: { student: { select: { classId: true, sectionId: true } } },
    });
    const combos = links
      .map((l) => l.student)
      .filter((s): s is { classId: string; sectionId: string | null } => Boolean(s?.classId));

    if (combos.length === 0) return apiOk({ role: "PARENT", homework: [] });

    const homework = await db.homework.findMany({
      where: {
        schoolId: actor.schoolId,
        status: { not: "DRAFT" },
        OR: combos.map((c) => ({ classId: c.classId, OR: [{ sectionId: c.sectionId }, { sectionId: null }] })),
      },
      orderBy: [{ dueOn: "asc" }, { assignedOn: "desc" }],
      take: 60,
      include: HOMEWORK_INCLUDE,
    });
    return apiOk({ role: "PARENT", homework });
  }

  return apiOk({ role: "NONE", homework: [] });
});

const SetHomeworkBody = z.object({
  sectionId: z.string().min(1),
  subjectId: z.string().min(1).optional().nullable(),
  title: z.string().min(1),
  details: z.string().optional().nullable(),
  assignedIso: z.string().optional().nullable(),
  dueIso: z.string().optional().nullable(),
  maxMarks: z.number().int().optional().nullable(),
  publish: z.boolean().optional(),
});

/** Mirrors src/app/app/homework/actions.ts::setHomework. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const input = SetHomeworkBody.parse(await req.json());

  const result = await setHomeworkForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ homeworkId: result.homeworkId, messages: result.messages }, 201);
});
