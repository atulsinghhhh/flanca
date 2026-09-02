import { db } from "@/lib/db";
import { requireMobileActor } from "@/lib/mobile/session";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/** A staff member's own employment details, for the mobile Profile tab — not the office's staff directory (staff/[id]). */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);

  const [staff, classTeacherOf] = await Promise.all([
    db.staff.findFirst({
      where: { schoolId: actor.schoolId, userId: actor.id },
      select: {
        employeeId: true,
        designation: true,
        department: true,
        joiningDate: true,
        qualification: true,
        phone: true,
        address: true,
        subjects: { select: { subject: { select: { name: true } } } },
      },
    }),
    db.section.findMany({
      where: { schoolId: actor.schoolId, classTeacherId: actor.id },
      select: { id: true, name: true, class: { select: { name: true } } },
      orderBy: { class: { sequenceOrder: "asc" } },
    }),
  ]);

  if (!staff) return apiOk({ staff: null, classTeacherOf: [] });

  return apiOk({
    staff: {
      employeeId: staff.employeeId,
      designation: staff.designation,
      department: staff.department,
      joiningDate: staff.joiningDate,
      qualification: staff.qualification,
      phone: staff.phone,
      address: staff.address,
      subjects: staff.subjects.map((s) => s.subject.name),
    },
    // Sections this account is the class teacher of — a class teacher's
    // remit is the whole class's week, not just the periods they personally
    // teach (that's /timetable/me).
    classTeacherOf: classTeacherOf.map((s) => ({ sectionId: s.id, sectionName: s.name, className: s.class.name })),
  });
});
