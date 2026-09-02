import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { canDeleteClass, canDeleteSection } from "@/lib/core/setup-core";
import { PageHead, Stat } from "@/components/ui/primitives";
import { ClassEditor, type ClassRow, type TeacherOption } from "./class-editor";

export const metadata = { title: "Classes & sections — Flanca" };

export default async function ClassesSetupPage() {
  const actor = await requireRole(...OFFICE);

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
    // Only people who could actually hold a class: on the payroll, and still here.
    db.staff.findMany({
      where: { schoolId: actor.schoolId, isActive: true },
      orderBy: { user: { name: "asc" } },
      select: { userId: true, employeeId: true, designation: true, user: { select: { name: true } } },
    }),
  ]);

  const rows: ClassRow[] = classes.map((c) => {
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

  const teachers: TeacherOption[] = staff.map((s) => ({
    userId: s.userId,
    name: s.user.name,
    designation: s.designation ?? s.employeeId,
  }));

  const sections = rows.reduce((n, c) => n + c.sections.length, 0);
  const unassigned = rows.reduce((n, c) => n + c.sections.filter((s) => !s.classTeacherId).length, 0);

  return (
    <>
      <Link
        href="/app/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Settings
      </Link>

      <PageHead
        eyebrow="Setup"
        title="Classes & sections"
        sub="The shape of the school. Attendance is marked per section, and a section's class teacher is the person parents can write to — so an unassigned section leaves those families with nobody."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Classes" value={rows.length} sub="Nursery to Class 12" />
        <Stat label="Sections" value={sections} sub="attendance is marked per section" />
        <Stat
          label="Without a class teacher"
          value={unassigned}
          sub={unassigned === 0 ? "every section has one" : "parents there have nobody to write to"}
          tone={unassigned === 0 ? "good" : "warn"}
        />
        <Stat label="Teachers available" value={teachers.length} sub="active staff" />
      </div>

      <ClassEditor classes={rows} teachers={teachers} />
    </>
  );
}
