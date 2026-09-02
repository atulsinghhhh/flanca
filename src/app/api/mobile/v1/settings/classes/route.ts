import { z } from "zod";
import { db } from "@/lib/db";
import { canDeleteClass, canDeleteSection } from "@/lib/core/setup-core";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { createClassForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/app/app/settings/classes/page.tsx. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);

  const [classes, staff] = await Promise.all([
    db.class.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { sequenceOrder: "asc" },
      select: {
        id: true,
        name: true,
        _count: { select: { students: true, sections: true, subjects: true } },
        sections: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            classTeacherId: true,
            classTeacher: { select: { name: true } },
            _count: { select: { students: true, attendance: true, timetable: true, homework: true } },
          },
        },
      },
    }),
    db.staff.findMany({
      where: { schoolId: actor.schoolId, isActive: true },
      orderBy: { user: { name: "asc" } },
      select: { userId: true, employeeId: true, designation: true, user: { select: { name: true } } },
    }),
  ]);

  const rows = classes.map((c) => {
    const classCheck = canDeleteClass({
      students: c._count.students,
      sections: c._count.sections,
      subjects: c._count.subjects,
    });
    return {
      id: c.id,
      name: c.name,
      students: c._count.students,
      subjects: c._count.subjects,
      removable: classCheck.allowed,
      whyNot: classCheck.reason,
      sections: c.sections.map((s) => {
        const check = canDeleteSection({
          students: s._count.students,
          attendance: s._count.attendance,
          timetable: s._count.timetable,
          homework: s._count.homework,
        });
        return {
          id: s.id,
          name: s.name,
          students: s._count.students,
          classTeacherId: s.classTeacherId,
          classTeacherName: s.classTeacher?.name ?? null,
          removable: check.allowed,
          whyNot: check.reason,
        };
      }),
    };
  });

  const teachers = staff.map((s) => ({
    userId: s.userId,
    name: s.user.name,
    designation: s.designation ?? s.employeeId,
  }));

  return apiOk({ classes: rows, teachers });
});

const Body = z.object({ name: z.string().min(1) });

/** Mirrors src/app/app/settings/classes/actions.ts::createClass. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await createClassForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ classId: result.classId, name: result.name }, 201);
});
