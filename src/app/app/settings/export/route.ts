import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { isoDay } from "@/lib/queries/when";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { formatMoney } from "@/lib/core/money";
import { formatPercent } from "@/lib/core/grading-core";

/**
 * The whole school, in one spreadsheet.
 *
 * This exists because the promise is "your data is yours" — a school must be
 * able to walk away with everything, free, without asking. Lock-in is the
 * reason schools distrust this market; refusing to build it would be the
 * cheapest possible betrayal of the pitch.
 */
export async function GET() {
  const actor = await requireRole(...OFFICE);

  const [school, students, staff, invoices, payments, results, certificates] = await Promise.all([
    db.school.findUnique({ where: { id: actor.schoolId } }),
    db.student.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: [{ class: { sequenceOrder: "asc" } }, { rollNumber: "asc" }],
      include: { class: true, section: true },
    }),
    db.staff.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { employeeId: "asc" },
      include: { user: true },
    }),
    db.feeInvoice.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { invoiceNumber: "asc" },
      include: { student: { select: { admissionNumber: true, name: true } } },
    }),
    db.feePayment.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { paidAt: "asc" },
      include: {
        student: { select: { admissionNumber: true, name: true } },
        receipt: { select: { receiptNumber: true } },
      },
    }),
    db.examResult.findMany({
      where: { schoolId: actor.schoolId },
      include: {
        student: { select: { admissionNumber: true, name: true } },
        exam: { include: { subject: true, examTerm: true, class: true } },
      },
    }),
    db.certificate.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { serialNo: "asc" },
      include: { student: { select: { admissionNumber: true, name: true } } },
    }),
  ]);

  const wb = XLSX.utils.book_new();
  const iso = (d: Date | null | undefined) => (d ? isoDay(d) : "");

  sheet(wb, "Students", students.map((s) => ({
    "Admission No": s.admissionNumber,
    Name: s.name,
    Class: s.class?.name ?? "",
    Section: s.section?.name ?? "",
    "Roll No": s.rollNumber ?? "",
    Gender: s.gender ?? "",
    "Date of Birth": iso(s.dob),
    "Father's Name": s.fatherName ?? "",
    "Mother's Name": s.motherName ?? "",
    Mobile: s.guardianPhone ?? "",
    Email: s.guardianEmail ?? "",
    Address: s.address ?? "",
    Category: s.category ?? "",
    "Blood Group": s.bloodGroup ?? "",
    "APAAR ID": s.apaarId ?? "",
    PEN: s.penNumber ?? "",
    "Name as per Aadhaar": s.aadhaarName ?? "",
    "Admission Date": iso(s.admissionDate),
    Status: s.status,
  })));

  sheet(wb, "Staff", staff.map((s) => ({
    "Employee ID": s.employeeId,
    Name: s.user.name,
    Designation: s.designation ?? "",
    Department: s.department ?? "",
    Qualification: s.qualification ?? "",
    "Joining Date": iso(s.joiningDate),
    Mobile: s.phone ?? "",
    Email: s.user.email,
    "Basic Pay": s.basicPay ? formatMoney(s.basicPay, { withSymbol: false }) : "",
    Active: s.isActive ? "Yes" : "No",
  })));

  sheet(wb, "Invoices", invoices.map((i) => ({
    "Invoice No": i.invoiceNumber,
    "Admission No": i.student.admissionNumber,
    Student: i.student.name,
    Term: i.label ?? "",
    "Issue Date": iso(i.issueDate),
    "Due Date": iso(i.dueDate),
    Gross: formatMoney(i.grossAmount, { withSymbol: false }),
    Concession: formatMoney(i.concessionAmount, { withSymbol: false }),
    "Late Fee": formatMoney(i.lateFeeAmount, { withSymbol: false }),
    Payable: formatMoney(i.amount, { withSymbol: false }),
    Paid: formatMoney(i.paidAmount, { withSymbol: false }),
    Status: i.status,
  })));

  sheet(wb, "Payments", payments.map((p) => ({
    "Receipt No": p.receipt?.receiptNumber ?? "",
    Date: iso(p.paidAt),
    "Admission No": p.student.admissionNumber,
    Student: p.student.name,
    Amount: formatMoney(p.amount, { withSymbol: false }),
    Mode: p.mode,
    Reference: p.reference ?? "",
    Reversed: p.reversedAt ? iso(p.reversedAt) : "",
  })));

  sheet(wb, "Marks", results.map((r) => ({
    "Admission No": r.student.admissionNumber,
    Student: r.student.name,
    Class: r.exam.class?.name ?? "",
    Term: r.exam.examTerm.name,
    Subject: r.exam.subject?.name ?? "",
    "Max Marks": r.exam.maxMarks,
    Marks: r.isAbsent ? "AB" : (r.marks ?? ""),
    Grade: r.grade ?? "",
    Published: r.state === "PUBLISHED" ? "Yes" : "No",
  })));

  sheet(wb, "Certificates", certificates.map((c) => ({
    "Serial No": c.serialNo,
    Type: c.type,
    "Admission No": c.student.admissionNumber,
    Student: c.student.name,
    "Issued On": iso(c.issuedOn),
    Cancelled: c.cancelledAt ? iso(c.cancelledAt) : "",
    "Verification Code": c.verifyToken,
  })));

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.export",
    entity: "School",
    entityId: actor.schoolId,
    summary: `Exported the full school: ${students.length} students, ${invoices.length} invoices, ${payments.length} payments, ${results.length} marks`,
  });

  const stamp = isoDay();
  const slug = school?.slug ?? "school";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${slug}-full-export-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

function sheet(wb: XLSX.WorkBook, name: string, rows: Array<Record<string, unknown>>) {
  // An empty sheet with headers is more useful than a missing one — it tells a
  // school there genuinely is no data, rather than that we forgot to export it.
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ "No records": "" }]);
  XLSX.utils.book_append_sheet(wb, ws, name);
}
