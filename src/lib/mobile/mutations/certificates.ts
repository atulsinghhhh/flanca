import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import { nextNumber } from "@/lib/sequence";
import { certificateMeta, dateInWords } from "@/lib/core/certificate-core";
import { summariseAttendance } from "@/lib/core/attendance-core";
import { outstandingOf } from "@/lib/core/fees-core";
import { formatMoney } from "@/lib/core/money";
import type { CertificateType } from "@prisma/client";

/**
 * The mobile-API twin of src/app/app/certificates/actions.ts.
 *
 * Same authorization (OFFICE, checked by the route via requireMobileRole
 * before these run), same serial numbering (a gap-free counter inside the
 * transaction), same frozen snapshot, same audit trail — just handed an
 * `actor` instead of calling `requireRole()`, and returning a discriminated
 * result instead of the `{error}`/`{ok}` shape a server action's caller
 * expects, so a route handler can turn it into the right HTTP status.
 * revalidatePath is a Next.js page-cache concern with nothing to invalidate
 * for a stateless JSON client, so it is dropped here — everything else is
 * preserved, including certificate-core.ts's type vocabulary, which is reused
 * exactly rather than reimplemented.
 */

type Failure = { ok: false; status: number; code: string; message: string };

const notFound = (message: string): Failure => ({ ok: false, status: 404, code: "not_found", message });
const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });
const conflict = (message: string): Failure => ({ ok: false, status: 409, code: "conflict", message });

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export type IssueCertificateInput = {
  studentId: string;
  type: CertificateType;
  issuedOn?: string;
  purpose?: string;
  conduct?: string;
  leavingReason?: string;
  remarks?: string;
  markTransferred?: boolean;
};

export type IssueCertificateResult = Failure | { ok: true; certificateId: string; serialNo: string };

/** Mirrors src/app/app/certificates/actions.ts::issueCertificate. */
export async function issueCertificateForActor(actor: Actor, input: IssueCertificateInput): Promise<IssueCertificateResult> {
  const student = await db.student.findFirst({
    where: { id: input.studentId, schoolId: actor.schoolId },
    include: {
      class: true,
      section: true,
      attendance: { select: { status: true, date: true } },
      invoices: { where: { status: { not: "CANCELLED" } } },
      concessions: { include: { concessionType: true } },
      enrollments: { include: { academicYear: true, class: true }, orderBy: { academicYear: { startDate: "asc" } } },
      examResults: {
        where: { state: "PUBLISHED" },
        include: { exam: { include: { subject: true } } },
      },
    },
  });
  if (!student) return notFound("That student is not on this school's roll.");

  const meta = certificateMeta(input.type);
  // Date-only values are stored and rendered as UTC midnight throughout. Parsing
  // "2026-08-19" in local time lands at 18:30Z the day before, and the printed
  // certificate then shows yesterday's date.
  const issuedOn = input.issuedOn ? new Date(`${input.issuedOn}T00:00:00Z`) : todayUtc();
  if (Number.isNaN(issuedOn.getTime())) return invalid("That issue date is not valid.");

  const [school, year] = await Promise.all([
    db.school.findUnique({ where: { id: actor.schoolId } }),
    db.academicYear.findFirst({ where: { schoolId: actor.schoolId, isCurrent: true } }),
  ]);

  const attendance = summariseAttendance(student.attendance as never);
  const outstanding = student.invoices.reduce((a, i) => a + outstandingOf(i), 0);

  // A TC with money still owed is a real decision, not a technicality — the
  // office must see it, but the school may still choose to issue.
  const feeWarning =
    outstanding > 0 ? `${formatMoney(outstanding)} was outstanding when this was issued` : null;

  const subjects = [...new Set(student.examResults.map((r) => r.exam.subject?.name).filter(Boolean))];

  const snapshot = {
    schoolName: school?.name,
    studentName: student.name,
    admissionNumber: student.admissionNumber,
    fatherName: student.fatherName,
    motherName: student.motherName,
    dob: student.dob?.toISOString() ?? null,
    dobInWords: student.dob ? dateInWords(student.dob) : null,
    category: student.category,
    religion: student.religion,
    nationality: "Indian",
    className: student.class?.name ?? null,
    sectionName: student.section?.name ?? null,
    admissionDate: student.admissionDate?.toISOString() ?? null,
    academicYear: year?.name ?? null,
    apaarId: student.apaarId,
    penNumber: student.penNumber,
    // TC-specific
    subjectsStudied: subjects,
    workingDays: attendance.workingDays,
    daysPresent: attendance.presentDays,
    attendancePercentBp: attendance.percentBp,
    concessions: student.concessions.map((c) => c.concessionType.name),
    yearsAttended: student.enrollments.map((e) => ({
      year: e.academicYear.name,
      className: e.class?.name ?? null,
    })),
    conduct: input.conduct ?? "Good",
    leavingReason: input.leavingReason ?? null,
    purpose: input.purpose ?? null,
    remarks: input.remarks ?? null,
    feeWarning,
    outstandingAtIssue: outstanding,
    issuedByName: actor.name,
  };

  let serialNo = "";
  const created = await db.$transaction(async (tx) => {
    serialNo = await nextNumber(tx, actor.schoolId, meta.sequenceKind, meta.prefix);

    const certificate = await tx.certificate.create({
      data: {
        schoolId: actor.schoolId,
        studentId: student.id,
        type: input.type,
        serialNo,
        issuedOn,
        snapshot: snapshot as never,
        issuedBy: actor.id,
      },
    });

    // Issuing a TC normally means the child has left. Never assume it — the
    // office ticks the box, and only then does the roll change.
    if (input.type === "TRANSFER" && input.markTransferred) {
      await tx.student.update({
        where: { id: student.id },
        data: {
          status: "TRANSFERRED",
          tcIssuedAt: issuedOn,
          exitReason: input.leavingReason ?? null,
        },
      });
    }

    return certificate;
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "certificate.issue",
    entity: "Certificate",
    entityId: created.id,
    summary: `Issued ${meta.label} ${serialNo} to ${student.name} (${student.admissionNumber})${feeWarning ? ` — ${feeWarning}` : ""}`,
    after: { type: input.type, serialNo },
  });

  return { ok: true, certificateId: created.id, serialNo };
}

export type SimpleResult = Failure | { ok: true };

/** Cancel a certificate. The serial is never reused — that is the whole point. Mirrors src/app/app/certificates/actions.ts::cancelCertificate. */
export async function cancelCertificateForActor(actor: Actor, certificateId: string, reason: string): Promise<SimpleResult> {
  if (!reason.trim()) return invalid("Give a reason for cancelling.");

  const certificate = await db.certificate.findFirst({
    where: { id: certificateId, schoolId: actor.schoolId },
    include: { student: { select: { name: true } } },
  });
  if (!certificate) return notFound("That certificate no longer exists.");
  if (certificate.cancelledAt) return conflict("That certificate is already cancelled.");

  await db.certificate.update({
    where: { id: certificate.id },
    data: { cancelledAt: new Date() },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "certificate.cancel",
    entity: "Certificate",
    entityId: certificate.id,
    summary: `Cancelled ${certificate.type} ${certificate.serialNo} for ${certificate.student.name}: ${reason.trim()}. The serial is retired, not reused.`,
  });

  return { ok: true };
}
