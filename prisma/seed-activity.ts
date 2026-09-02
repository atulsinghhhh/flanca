/**
 * Second seed pass: everything that makes the school look ALIVE — invoices that
 * add up, receipts with real numbers, a term of attendance, a finished exam
 * cycle with report cards, a library in use, and defaulters at every age.
 *
 * Runs after prisma/seed.ts (which creates the school).
 */
import { PrismaClient } from "@prisma/client";
import { buildInvoice, toRupee } from "../src/lib/core/fees-core";
import { CBSE_8_POINT, computeReport, gradeFor, percentBp, rankStudents } from "../src/lib/core/grading-core";
import { BOOK_TITLES, FATHER_FIRST, LOCALITIES, MOTHER_FIRST, SURNAMES, BOY_FIRST, GIRL_FIRST } from "./seed-data";

const db = new PrismaClient();

let seedState = 0x1f2e3d4c;
function rnd(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const chance = (p: number) => rnd() < p;
const paise = (r: number) => Math.round(r * 100);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

const TODAY = new Date(Date.UTC(2026, 7, 19));

async function main() {
  const school = await db.school.findUnique({
    where: { slug: "nalanda-public-school" },
    include: { academicYears: { where: { isCurrent: true } } },
  });
  if (!school) throw new Error("Run prisma/seed.ts first");
  const year = school.academicYears[0];

  const [students, classes, feeHeads, structures, concessionTypes, staff, subjects] = await Promise.all([
    db.student.findMany({ where: { schoolId: school.id }, orderBy: { admissionNumber: "asc" } }),
    db.class.findMany({ where: { schoolId: school.id }, orderBy: { sequenceOrder: "asc" }, include: { sections: true } }),
    db.feeHead.findMany({ where: { schoolId: school.id } }),
    db.feeStructure.findMany({ where: { schoolId: school.id }, include: { items: true, installments: { orderBy: { sequenceOrder: "asc" } } } }),
    db.concessionType.findMany({ where: { schoolId: school.id } }),
    db.staff.findMany({ where: { schoolId: school.id }, include: { user: true } }),
    db.subject.findMany({ where: { schoolId: school.id } }),
  ]);

  const headName = new Map(feeHeads.map((h) => [h.id, h.name]));
  const structureFor = new Map(structures.map((s) => [s.classId!, s]));
  const clerk = staff.find((s) => s.designation === "Office Superintendent")!;
  const accountant = staff.find((s) => s.designation === "Accountant")!;

  // ───────────────────── concessions for a realistic slice of the roster ─────────────────────
  console.log("→ concessions");
  const siblingType = concessionTypes.find((c) => c.name === "Sibling Concession")!;
  const staffWard = concessionTypes.find((c) => c.name === "Staff Ward")!;
  const rte = concessionTypes.find((c) => c.name === "RTE (25%)")!;
  const merit = concessionTypes.find((c) => c.name === "Merit Scholarship")!;

  const concessionByStudent = new Map<string, { percentage: number; label: string }>();
  for (const s of students) {
    const roll = rnd();
    let type = null as null | { id: string; pct: number; label: string };
    if (roll < 0.06) type = { id: rte.id, pct: 100, label: "RTE (25%)" };
    else if (roll < 0.09) type = { id: staffWard.id, pct: 50, label: "Staff Ward" };
    else if (roll < 0.17) type = { id: siblingType.id, pct: 10, label: "Sibling Concession" };
    else if (roll < 0.20) type = { id: merit.id, pct: 25, label: "Merit Scholarship" };
    if (!type) continue;

    await db.studentConcession.create({
      data: {
        schoolId: school.id, studentId: s.id, concessionTypeId: type.id,
        percentage: type.pct, approvedAt: addDays(TODAY, -int(60, 140)), note: "Approved by Principal",
      },
    });
    concessionByStudent.set(s.id, { percentage: type.pct, label: type.label });
  }
  console.log(`   ${concessionByStudent.size} students on concession`);

  // ───────────────────── invoices: 4 terms, itemised head-wise ─────────────────────
  console.log("→ invoices (itemised, 4 terms)");
  let invoiceSeq = 1;
  const invoiceRows: Array<{
    id: string; studentId: string; amount: number; paid: number; status: string; dueDate: Date; term: number;
  }> = [];

  const transportByStudent = new Map(
    (await db.studentTransport.findMany({ where: { schoolId: school.id }, include: { stop: true } }))
      .map((t) => [t.studentId, t.stop?.monthlyFee ?? 0]),
  );

  for (const student of students) {
    const structure = structureFor.get(student.classId!);
    if (!structure) continue;

    const baseLines = structure.items.map((i) => ({ head: headName.get(i.feeHeadId)!, amount: i.amount }));
    const transportMonthly = transportByStudent.get(student.id) ?? 0;
    const lines = transportMonthly > 0
      ? [...baseLines, { head: "Transport", amount: transportMonthly * 12 }]
      : baseLines;

    const conc = concessionByStudent.get(student.id);
    const concessions = conc ? [{ percentage: conc.percentage, heads: ["Tuition Fee"], label: conc.label }] : [];

    for (let t = 0; t < structure.installments.length; t++) {
      const inst = structure.installments[t];
      const totals = buildInvoice({ lines, concessions, share: 0.25 });

      // Terms 3 and 4 are not yet raised — a school in August has two terms billed.
      if (t >= 2) continue;

      const dueDate = inst.dueDate;
      const invoiceNumber = `INV/26-27/${String(invoiceSeq++).padStart(5, "0")}`;

      const created = await db.feeInvoice.create({
        data: {
          schoolId: school.id, academicYearId: year.id, studentId: student.id,
          installmentPlanId: inst.id, invoiceNumber, label: inst.label,
          lineItems: totals.lines.map((l) => ({
            head: l.head, amount: l.amount, concession: l.concession ?? 0,
          })) as never,
          grossAmount: totals.gross, concessionAmount: totals.concession, amount: totals.net,
          issueDate: addDays(dueDate, -15), dueDate, status: "UNPAID",
        },
      });

      invoiceRows.push({
        id: created.id, studentId: student.id, amount: totals.net,
        paid: 0, status: "UNPAID", dueDate, term: t,
      });
    }
  }
  console.log(`   ${invoiceRows.length} invoices raised`);

  // ───────────────────── payments + receipts ─────────────────────
  console.log("→ payments + receipts");
  let receiptSeq = 1;
  const paymentsToLog: Array<{ invoiceId: string; studentId: string; amount: number; paidAt: Date; mode: string }> = [];

  for (const inv of invoiceRows) {
    // Term 1 (due April): ~94% collected. Term 2 (due July): ~72% collected — so
    // the demo has fresh dues, real defaulters, and every ageing bucket populated.
    const collectProbability = inv.term === 0 ? 0.94 : 0.72;
    if (!chance(collectProbability)) continue;

    const partial = chance(0.08);
    const amount = partial ? toRupee(inv.amount * (chance(0.5) ? 0.5 : 0.6)) : inv.amount;

    // Most parents pay around the due date, but a real counter also takes money
    // every single day from the stragglers — so a slice lands in the last fortnight.
    const paidRecently = inv.term === 1 && chance(0.34);
    const paidAt = paidRecently
      ? addDays(TODAY, -int(0, 13))
      : addDays(inv.dueDate, int(-12, inv.term === 0 ? 20 : 25));
    if (paidAt > TODAY) continue;

    const mode = pick(["UPI", "UPI", "UPI", "CASH", "CASH", "CHEQUE", "NETBANKING"]);
    paymentsToLog.push({ invoiceId: inv.id, studentId: inv.studentId, amount, paidAt, mode });
    inv.paid = amount;
    inv.status = amount >= inv.amount ? "PAID" : "PARTIAL";
  }

  // Receipts are numbered as they are issued, so the numbers have to follow the
  // dates. Created in student order, receipt 900 ended up dated before receipt 300 —
  // and a day book where the numbers and the dates disagree is the first thing an
  // auditor picks up.
  paymentsToLog.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());

  for (const p of paymentsToLog) {
    const payment = await db.feePayment.create({
      data: {
        schoolId: school.id, studentId: p.studentId, invoiceId: p.invoiceId,
        amount: p.amount, mode: p.mode as never,
        reference: p.mode === "UPI" ? `UPI${int(100000000000, 999999999999)}`
          : p.mode === "CHEQUE" ? `CHQ ${int(100000, 999999)}`
          : p.mode === "NETBANKING" ? `NB${int(10000000, 99999999)}` : null,
        bankName: p.mode === "CHEQUE" ? pick(["SBI", "HDFC Bank", "Bank of India", "Punjab National Bank"]) : null,
        paidAt: p.paidAt,
        collectedBy: p.mode === "CASH" || p.mode === "CHEQUE" ? clerk.userId : accountant.userId,
      },
    });

    await db.receipt.create({
      data: {
        schoolId: school.id, paymentId: payment.id,
        receiptNumber: `RCP/26-27/${String(receiptSeq++).padStart(5, "0")}`,
        issuedAt: p.paidAt,
        snapshot: { amount: p.amount, mode: p.mode, paidAt: p.paidAt.toISOString() } as never,
      },
    });
  }

  // reflect payments on the invoices
  for (const inv of invoiceRows) {
    if (inv.paid === 0) continue;
    await db.feeInvoice.update({
      where: { id: inv.id },
      data: { paidAmount: inv.paid, status: inv.status as never },
    });
  }
  await db.numberSequence.createMany({
    data: [
      { schoolId: school.id, kind: "RECEIPT", prefix: "RCP/26-27/", next: receiptSeq, width: 5 },
      { schoolId: school.id, kind: "INVOICE", prefix: "INV/26-27/", next: invoiceSeq, width: 5 },
      { schoolId: school.id, kind: "CERT_TRANSFER", prefix: "TC/26-27/", next: 12, width: 4 },
      { schoolId: school.id, kind: "CERT_BONAFIDE", prefix: "BC/26-27/", next: 34, width: 4 },
      { schoolId: school.id, kind: "CERT_CHARACTER", prefix: "CC/26-27/", next: 7, width: 4 },
      { schoolId: school.id, kind: "APPLICATION", prefix: "APP/26-27/", next: 41, width: 4 },
      { schoolId: school.id, kind: "GATEPASS", prefix: "GP/", next: 88, width: 4 },
    ],
    skipDuplicates: true,
  });
  console.log(`   ${paymentsToLog.length} payments, ${receiptSeq - 1} receipts`);

  // ───────────────────── attendance: last 40 working days ─────────────────────
  console.log("→ attendance (40 working days)");
  const workingDays: Date[] = [];
  let cursor = new Date(TODAY);
  while (workingDays.length < 40) {
    const day = cursor.getUTCDay();
    const isSecondSaturday = day === 6 && cursor.getUTCDate() > 7 && cursor.getUTCDate() <= 14;
    if (day !== 0 && !isSecondSaturday) workingDays.unshift(new Date(cursor));
    cursor = addDays(cursor, -1);
  }

  const teacherUserIds = staff.filter((s) => s.designation?.includes("Teacher")).map((s) => s.userId);

  // Give a handful of students a genuine attendance problem so the shortage
  // report and the board-eligibility warning have something true to show.
  const chronic = new Set(students.filter(() => chance(0.035)).map((s) => s.id));

  let attendanceBatch: Array<Record<string, unknown>> = [];
  let attendanceCount = 0;

  for (const date of workingDays) {
    for (const student of students) {
      const isChronic = chronic.has(student.id);
      const roll = rnd();
      let status: string;
      if (isChronic) status = roll < 0.42 ? "ABSENT" : roll < 0.5 ? "LATE" : "PRESENT";
      else status = roll < 0.045 ? "ABSENT" : roll < 0.065 ? "LATE" : roll < 0.072 ? "LEAVE" : "PRESENT";

      attendanceBatch.push({
        schoolId: school.id, date, classId: student.classId, sectionId: student.sectionId,
        studentId: student.id, period: 0, status,
        markedByUserId: pick(teacherUserIds), markedAt: new Date(date.getTime() + 9.5 * 3600_000),
        clientKey: `att:${student.id}:${date.toISOString().slice(0, 10)}:0`,
      });

      if (attendanceBatch.length >= 4000) {
        await db.attendance.createMany({ data: attendanceBatch as never, skipDuplicates: true });
        attendanceCount += attendanceBatch.length;
        attendanceBatch = [];
      }
    }
  }
  if (attendanceBatch.length) {
    await db.attendance.createMany({ data: attendanceBatch as never, skipDuplicates: true });
    attendanceCount += attendanceBatch.length;
  }
  console.log(`   ${attendanceCount} attendance marks`);

  // staff attendance for the same period
  let staffAtt: Array<Record<string, unknown>> = [];
  for (const date of workingDays) {
    for (const s of staff) {
      const roll = rnd();
      staffAtt.push({
        schoolId: school.id, date, staffId: s.id, period: 0,
        status: roll < 0.03 ? "ABSENT" : roll < 0.055 ? "LEAVE" : "PRESENT",
        markedAt: new Date(date.getTime() + 8.5 * 3600_000),
        clientKey: `satt:${s.id}:${date.toISOString().slice(0, 10)}:0`,
      });
    }
  }
  await db.attendance.createMany({ data: staffAtt as never, skipDuplicates: true });

  console.log("✓ activity seed part A complete");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
