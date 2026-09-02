import { z } from "zod";
import { db } from "@/lib/db";
import { canDeleteSubject } from "@/lib/core/setup-core";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { createSubjectForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/**
 * Mirrors src/app/app/settings/subjects/page.tsx: one class's subjects at a
 * time (a school has many classes and many subjects each, so there is no
 * "list everything" mode on the web page either) — pass ?classId= to pick
 * which; defaults to the first class in sequence order, same as the page.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const classId = new URL(req.url).searchParams.get("classId") ?? undefined;

  const classes = await db.class.findMany({
    where: { schoolId: actor.schoolId },
    orderBy: { sequenceOrder: "asc" },
    select: { id: true, name: true, _count: { select: { subjects: true } } },
  });

  const selected = classes.find((c) => c.id === classId) ?? classes[0] ?? null;

  const [subjects, staff] = await Promise.all([
    selected
      ? db.subject.findMany({
          where: { schoolId: actor.schoolId, classId: selected.id },
          orderBy: [{ isCoScholastic: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            code: true,
            isElective: true,
            isCoScholastic: true,
            staffSubjects: { select: { staffId: true, staff: { select: { user: { select: { name: true } } } } } },
            _count: { select: { exams: true, timetable: true, homework: true, lessonPlans: true } },
          },
        })
      : Promise.resolve([]),
    db.staff.findMany({
      where: { schoolId: actor.schoolId, isActive: true },
      orderBy: { user: { name: "asc" } },
      select: { id: true, employeeId: true, designation: true, user: { select: { name: true } } },
    }),
  ]);

  const rows = subjects.map((s) => {
    const check = canDeleteSubject({
      exams: s._count.exams,
      timetable: s._count.timetable,
      homework: s._count.homework,
      lessonPlans: s._count.lessonPlans,
    });
    return {
      id: s.id,
      name: s.name,
      code: s.code,
      isElective: s.isElective,
      isCoScholastic: s.isCoScholastic,
      teacherStaffIds: s.staffSubjects.map((ss) => ss.staffId),
      teacherNames: s.staffSubjects.map((ss) => ss.staff.user.name),
      removable: check.allowed,
      whyNot: check.reason,
    };
  });

  const teachers = staff.map((s) => ({
    staffId: s.id,
    name: s.user.name,
    label: `${s.user.name} · ${s.designation ?? s.employeeId}`,
  }));

  return apiOk({
    classes: classes.map((c) => ({ id: c.id, name: c.name, subjectCount: c._count.subjects })),
    selectedClassId: selected?.id ?? null,
    subjects: rows,
    teachers,
  });
});

const Body = z.object({
  classId: z.string().min(1),
  name: z.string().min(1),
  code: z.string().nullish(),
  isElective: z.boolean().optional(),
  isCoScholastic: z.boolean().optional(),
});

/** Mirrors src/app/app/settings/subjects/actions.ts::createSubject. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await createSubjectForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ subjectId: result.subjectId }, 201);
});
