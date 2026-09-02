import { db } from "@/lib/db";
import type { Prisma, StudentStatus } from "@prisma/client";
import { deriveApaarState, nameMismatch } from "@/lib/core/apaar-core";
import { outstandingOf, summariseDues } from "@/lib/core/fees-core";
import { absenceStreak, eligibilityCheck, summariseAttendance } from "@/lib/core/attendance-core";

export const PAGE_SIZE = 50;

export type StudentFilters = {
  q?: string;
  classId?: string;
  sectionId?: string;
  status?: StudentStatus;
  apaar?: "issued" | "blocking";
  dues?: "overdue" | "clear";
  page?: number;
};

/**
 * The roster. The office opens this fifty times a day, so it must answer
 * "who is this and what do they owe" in one pass. The market's benchmark
 * failure is "15 minutes to find a student's fee status".
 */
export async function listStudents(schoolId: string, filters: StudentFilters) {
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.StudentWhereInput = {
    schoolId,
    status: filters.status ?? "ACTIVE",
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
    ...(filters.apaar === "issued" ? { NOT: { apaarId: null } } : {}),
    ...(filters.apaar === "blocking" ? { apaarId: null } : {}),
    ...(filters.q ? { OR: searchClauses(filters.q) } : {}),
  };

  const [total, rows] = await Promise.all([
    db.student.count({ where }),
    db.student.findMany({
      where,
      orderBy: [
        { class: { sequenceOrder: "asc" } },
        { section: { name: "asc" } },
        { rollNumber: "asc" },
      ],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        admissionNumber: true,
        name: true,
        rollNumber: true,
        gender: true,
        fatherName: true,
        guardianPhone: true,
        apaarId: true,
        apaarStatus: true,
        aadhaarName: true,
        status: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
      },
    }),
  ]);

  // Dues for exactly the rows on screen, never for the whole school.
  const invoices = rows.length
    ? await db.feeInvoice.findMany({
        where: { schoolId, studentId: { in: rows.map((r) => r.id) }, status: { not: "CANCELLED" } },
        select: { studentId: true, amount: true, paidAmount: true, status: true, dueDate: true },
      })
    : [];

  const duesByStudent = new Map<string, { outstanding: number; overdue: boolean }>();
  const now = new Date();
  for (const inv of invoices) {
    const out = outstandingOf(inv);
    const prev = duesByStudent.get(inv.studentId) ?? { outstanding: 0, overdue: false };
    duesByStudent.set(inv.studentId, {
      outstanding: prev.outstanding + out,
      overdue: prev.overdue || (out > 0 && inv.dueDate < now),
    });
  }

  const withDues = rows.map((r) => {
    const dues = duesByStudent.get(r.id) ?? { outstanding: 0, overdue: false };
    return {
      ...r,
      outstanding: dues.outstanding,
      overdue: dues.overdue,
      apaarState: deriveApaarState({
        id: r.id,
        name: r.name,
        apaarId: r.apaarId,
        apaarStatus: r.apaarStatus,
        aadhaarName: r.aadhaarName,
        consentGranted: r.apaarStatus !== "CONSENT_PENDING" && r.apaarStatus !== "CONSENT_REFUSED",
        consentRefused: r.apaarStatus === "CONSENT_REFUSED",
      }),
    };
  });

  const filtered =
    filters.dues === "overdue"
      ? withDues.filter((r) => r.overdue)
      : filters.dues === "clear"
        ? withDues.filter((r) => r.outstanding === 0)
        : withDues;

  return {
    rows: filtered,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/**
 * A phone clause is only added when the query actually looks like a number.
 * Otherwise "NPS/21" reduces to "21" and matches every mobile containing 21.
 */
function searchClauses(q: string): Prisma.StudentWhereInput[] {
  const clauses: Prisma.StudentWhereInput[] = [
    { name: { contains: q, mode: "insensitive" } },
    { admissionNumber: { contains: q, mode: "insensitive" } },
    { fatherName: { contains: q, mode: "insensitive" } },
    { motherName: { contains: q, mode: "insensitive" } },
  ];

  const digits = q.replace(/[\s+\-()]/g, "");
  if (/^\d{4,}$/.test(digits)) {
    clauses.push({ guardianPhone: { contains: digits.slice(-10) } });
    clauses.push({ apaarId: { contains: digits } });
    clauses.push({ penNumber: { contains: digits } });
  }

  return clauses;
}

export async function getClassOptions(schoolId: string) {
  return db.class.findMany({
    where: { schoolId },
    orderBy: { sequenceOrder: "asc" },
    select: {
      id: true,
      name: true,
      sections: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });
}

/** Everything about one child, on one screen. */
export async function getStudent(schoolId: string, studentId: string) {
  const student = await db.student.findFirst({
    where: { id: studentId, schoolId },
    include: {
      class: true,
      section: { include: { classTeacher: { select: { name: true } } } },
      parentLinks: { include: { user: { select: { id: true, name: true, phone: true, email: true } } } },
      documents: { orderBy: { uploadedAt: "desc" } },
      concessions: { include: { concessionType: true } },
      consentRecords: true,
      certificates: { orderBy: { issuedOn: "desc" } },
      conductRecords: { orderBy: { date: "desc" }, take: 8 },
      transport: { where: { toDate: null }, include: { route: true, stop: true } },
      bookIssues: { include: { book: true }, orderBy: { issuedOn: "desc" }, take: 6 },
      enrollments: {
        include: { academicYear: true, class: true, section: true },
        orderBy: { academicYear: { startDate: "desc" } },
      },
    },
  });
  if (!student) return null;

  const [invoices, payments, attendance, reportCards, results] = await Promise.all([
    db.feeInvoice.findMany({
      where: { studentId, status: { not: "CANCELLED" } },
      orderBy: { dueDate: "asc" },
    }),
    db.feePayment.findMany({
      where: { studentId, reversedAt: null },
      orderBy: { paidAt: "desc" },
      include: { receipt: true },
    }),
    db.attendance.findMany({
      where: { studentId },
      orderBy: { date: "desc" },
      select: { date: true, status: true },
    }),
    db.reportCard.findMany({
      where: { studentId },
      orderBy: { generatedAt: "desc" },
      include: { examTerm: true },
    }),
    db.examResult.findMany({
      where: { studentId, state: "PUBLISHED" },
      include: { exam: { include: { subject: true, examTerm: true } } },
      orderBy: { enteredAt: "desc" },
      take: 40,
    }),
  ]);

  const now = new Date();
  const attSummary = summariseAttendance(attendance as never);
  // Roughly 200 working days in an Indian academic year; what is left drives the projection.
  const remainingDays = Math.max(0, 200 - attSummary.workingDays);

  return {
    student,
    fees: {
      invoices,
      payments,
      ...summariseDues(invoices, now),
    },
    attendance: {
      summary: attSummary,
      eligibility: eligibilityCheck({
        presentDays: attSummary.presentDays,
        workingDays: attSummary.workingDays,
        remainingDays,
      }),
      streak: absenceStreak(attendance as never),
      recent: attendance.slice(0, 30),
    },
    reportCards,
    results,
    apaar: {
      state: deriveApaarState({
        id: student.id,
        name: student.name,
        apaarId: student.apaarId,
        apaarStatus: student.apaarStatus,
        aadhaarName: student.aadhaarName,
        consentGranted: student.consentRecords.some(
          (c) => c.purpose === "APAAR_GENERATION" && c.state === "GRANTED",
        ),
        consentRefused: student.consentRecords.some(
          (c) => c.purpose === "APAAR_GENERATION" && c.state === "REFUSED",
        ),
      }),
      nameCheck: nameMismatch(student.name, student.aadhaarName),
    },
  };
}
