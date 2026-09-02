"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { allocateAdmissionNumber } from "../students/actions";
import type { ApplicationStatus, EnquiryStatus } from "@prisma/client";

/** Move an application along, with a note the parent will actually see. */
export async function updateApplication(input: {
  id: string;
  status: ApplicationStatus;
  documentsNote?: string;
  reviewNote?: string;
}) {
  const actor = await requireRole(...OFFICE);

  const application = await db.application.findFirst({
    where: { id: input.id, schoolId: actor.schoolId },
  });
  if (!application) return { error: "That application no longer exists." };

  await db.application.update({
    where: { id: application.id },
    data: {
      status: input.status,
      documentsNote: input.documentsNote?.trim() || null,
      reviewNote: input.reviewNote?.trim() || null,
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "admission.update",
    entity: "Application",
    entityId: application.id,
    summary: `${application.applicationNo} (${application.studentName}) moved to ${input.status.toLowerCase().replace(/_/g, " ")}`,
    before: { status: application.status },
    after: { status: input.status },
  });

  revalidatePath("/app/admissions");
  return { ok: true };
}

/**
 * Turn an accepted application into a student on the roll.
 *
 * The admission number is issued here, and the enquiry that produced it is
 * closed, so nothing has to be re-typed from the application form.
 */
export async function enrolApplicant(input: { id: string; classId: string }) {
  const actor = await requireRole(...OFFICE);

  const [application, cls, year] = await Promise.all([
    db.application.findFirst({ where: { id: input.id, schoolId: actor.schoolId } }),
    db.class.findFirst({ where: { id: input.classId, schoolId: actor.schoolId } }),
    db.academicYear.findFirst({ where: { schoolId: actor.schoolId, isCurrent: true } }),
  ]);

  if (!application) return { error: "That application no longer exists." };
  if (application.enrolledStudentId) return { error: "This applicant is already on the roll." };
  if (!cls) return { error: "Choose the class to admit into." };

  // The admission number comes from the same allocator the front desk uses.
  // This used to read the "last" number with orderBy admissionNumber desc — a
  // LEXICOGRAPHIC sort, which thinks NPS/999 is greater than NPS/1848 and would
  // hand a new child a number already on the roll. It also hardcoded the demo
  // school's own NPS/ prefix, and ran outside the transaction, so two clerks
  // admitting at once got the same number.
  const student = await db.$transaction(async (tx) => {
    const admissionNumber = await allocateAdmissionNumber(tx, actor.schoolId);
    const created = await tx.student.create({
      data: {
        schoolId: actor.schoolId,
        admissionNumber,
        name: application.studentName,
        dob: application.dob,
        gender: application.gender,
        classId: cls.id,
        status: "ACTIVE",
        admissionDate: new Date(),
        fatherName: application.parentName,
        guardianPhone: application.phone,
        guardianEmail: application.email,
        address: application.address,
        aadhaarName: application.studentName,
        apaarStatus: "CONSENT_PENDING",
      },
    });

    if (year) {
      await tx.studentEnrollment.create({
        data: {
          schoolId: actor.schoolId,
          studentId: created.id,
          academicYearId: year.id,
          classId: cls.id,
        },
      });
    }

    await tx.application.update({
      where: { id: application.id },
      data: { status: "ENROLLED", enrolledStudentId: created.id },
    });

    await tx.enquiry.updateMany({
      where: { schoolId: actor.schoolId, phone: application.phone, status: { not: "CONVERTED" } },
      data: { status: "CONVERTED" },
    });

    return created;
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "admission.enrol",
    entity: "Student",
    entityId: student.id,
    summary: `Admitted ${student.name} into ${cls.name} as ${student.admissionNumber} from application ${application.applicationNo}`,
  });

  revalidatePath("/app/admissions");
  revalidatePath("/app/students");
  return { ok: true, studentId: student.id, admissionNumber: student.admissionNumber };
}

export async function updateEnquiry(input: { id: string; status: EnquiryStatus; notes?: string }) {
  const actor = await requireRole(...OFFICE);

  const enquiry = await db.enquiry.findFirst({ where: { id: input.id, schoolId: actor.schoolId } });
  if (!enquiry) return { error: "That enquiry no longer exists." };

  await db.enquiry.update({
    where: { id: enquiry.id },
    data: { status: input.status, notes: input.notes?.trim() || enquiry.notes },
  });

  revalidatePath("/app/admissions");
  return { ok: true };
}
