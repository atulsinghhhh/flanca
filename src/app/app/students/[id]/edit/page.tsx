import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole, OFFICE } from "@/lib/session";
import { db } from "@/lib/db";
import { isoDay } from "@/lib/queries/when";
import { PageHead } from "@/components/ui/primitives";
import { StudentForm } from "../../student-form";

export const metadata = { title: "Correct a student — Flanca" };

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireRole(...OFFICE);

  const [student, classes] = await Promise.all([
    db.student.findFirst({
      where: { id, schoolId: actor.schoolId },
      select: {
        id: true, name: true, admissionNumber: true, classId: true, sectionId: true, rollNumber: true,
        dob: true, gender: true, fatherName: true, motherName: true, guardianPhone: true,
        guardianEmail: true, address: true, category: true, bloodGroup: true, admissionDate: true,
      },
    }),
    db.class.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { sequenceOrder: "asc" },
      select: { id: true, name: true, sections: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
    }),
  ]);
  if (!student) notFound();

  return (
    <>
      <Link
        href={`/app/students/${student.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Back to {student.name}
      </Link>

      <PageHead
        eyebrow={`${student.admissionNumber} · correction`}
        title={student.name}
        sub="Every change is written to the audit trail, with what it was before."
      />

      <StudentForm
        classes={classes}
        todayIso={isoDay()}
        existing={{
          studentId: student.id,
          admissionNumber: student.admissionNumber,
          name: student.name,
          classId: student.classId ?? "",
          sectionId: student.sectionId ?? "",
          rollNumber: student.rollNumber,
          dobIso: student.dob ? isoDay(student.dob) : "",
          gender: student.gender ?? "",
          fatherName: student.fatherName,
          motherName: student.motherName,
          guardianPhone: student.guardianPhone,
          guardianEmail: student.guardianEmail,
          address: student.address,
          category: student.category,
          bloodGroup: student.bloodGroup,
          admissionDateIso: student.admissionDate ? isoDay(student.admissionDate) : "",
        }}
      />
    </>
  );
}
