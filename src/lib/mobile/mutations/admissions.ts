import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import { allocateAdmissionNumber } from "@/app/app/students/actions";
import type { ApplicationStatus, EnquiryStatus } from "@prisma/client";

/**
 * The mobile-API twin of src/app/app/admissions/actions.ts.
 *
 * Same reach checks (schoolId scoping via requireRole → actor.schoolId), same
 * db writes, same audit trail — just handed an `actor` instead of calling
 * `requireRole()`, and returning a discriminated result instead of the
 * `{error}`/`{ok}` shape a server action's caller expects, so a route handler
 * can turn it into the right HTTP status.
 *
 * revalidatePath is a Next.js page-cache concern with nothing to invalidate
 * for a stateless JSON client, so it is dropped here — everything else is
 * preserved.
 */

type Failure = { ok: false; status: number; code: string; message: string };

const notFoundApplication = (): Failure => ({
  ok: false,
  status: 404,
  code: "not_found",
  message: "That application no longer exists.",
});
const notFoundEnquiry = (): Failure => ({
  ok: false,
  status: 404,
  code: "not_found",
  message: "That enquiry no longer exists.",
});
const conflict = (message: string): Failure => ({ ok: false, status: 409, code: "conflict", message });
const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });

export type UpdateApplicationInput = {
  status: ApplicationStatus;
  documentsNote?: string;
  reviewNote?: string;
};

export type UpdateApplicationResult = Failure | { ok: true };

/** Mirrors src/app/app/admissions/actions.ts::updateApplication. */
export async function updateApplicationForActor(
  actor: Actor,
  applicationId: string,
  input: UpdateApplicationInput,
): Promise<UpdateApplicationResult> {
  const application = await db.application.findFirst({
    where: { id: applicationId, schoolId: actor.schoolId },
  });
  if (!application) return notFoundApplication();

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

  return { ok: true };
}

export type EnrolApplicantInput = { classId: string };

export type EnrolApplicantResult = Failure | { ok: true; studentId: string; admissionNumber: string };

/**
 * Turn an accepted application into a student on the roll.
 *
 * The admission number is issued here, and the enquiry that produced it is
 * closed, so nothing has to be re-typed from the application form.
 */
export async function enrolApplicantForActor(
  actor: Actor,
  applicationId: string,
  input: EnrolApplicantInput,
): Promise<EnrolApplicantResult> {
  const [application, cls, year] = await Promise.all([
    db.application.findFirst({ where: { id: applicationId, schoolId: actor.schoolId } }),
    db.class.findFirst({ where: { id: input.classId, schoolId: actor.schoolId } }),
    db.academicYear.findFirst({ where: { schoolId: actor.schoolId, isCurrent: true } }),
  ]);

  if (!application) return notFoundApplication();
  if (application.enrolledStudentId) return conflict("This applicant is already on the roll.");
  if (!cls) return invalid("Choose the class to admit into.");

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

  return { ok: true, studentId: student.id, admissionNumber: student.admissionNumber };
}

export type UpdateEnquiryInput = { status: EnquiryStatus; notes?: string };

export type UpdateEnquiryResult = Failure | { ok: true };

/** Mirrors src/app/app/admissions/actions.ts::updateEnquiry. */
export async function updateEnquiryForActor(
  actor: Actor,
  enquiryId: string,
  input: UpdateEnquiryInput,
): Promise<UpdateEnquiryResult> {
  const enquiry = await db.enquiry.findFirst({ where: { id: enquiryId, schoolId: actor.schoolId } });
  if (!enquiry) return notFoundEnquiry();

  await db.enquiry.update({
    where: { id: enquiry.id },
    data: { status: input.status, notes: input.notes?.trim() || enquiry.notes },
  });

  return { ok: true };
}
