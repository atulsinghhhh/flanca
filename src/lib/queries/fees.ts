import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { ageBucket, daysBetween, lateFineFor, outstandingOf, summariseDues } from "@/lib/core/fees-core";
import type { ConcessionRule, FeeLine } from "@/lib/core/fees-core";

export type DuesFilters = {
  q?: string;
  classId?: string;
  bucket?: "1-30" | "31-60" | "61-90" | "90+" | "CURRENT";
  minAmount?: number;
};

/**
 * The defaulter report a principal asks for by name, every month. Ordered by
 * how long the money has been outstanding, not alphabetically — the oldest
 * debt is the one that needs the phone call.
 */
export async function getDuesReport(schoolId: string, filters: DuesFilters = {}, asOf = new Date()) {
  const where: Prisma.FeeInvoiceWhereInput = {
    schoolId,
    status: { in: ["UNPAID", "PARTIAL"] },
    ...(filters.classId ? { student: { classId: filters.classId } } : {}),
    ...(filters.q
      ? {
          student: {
            ...(filters.classId ? { classId: filters.classId } : {}),
            OR: [
              { name: { contains: filters.q, mode: "insensitive" } },
              { admissionNumber: { contains: filters.q, mode: "insensitive" } },
              { fatherName: { contains: filters.q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  const invoices = await db.feeInvoice.findMany({
    where,
    include: {
      student: {
        select: {
          id: true, name: true, admissionNumber: true, guardianPhone: true,
          fatherName: true,
          class: { select: { name: true, sequenceOrder: true } },
          section: { select: { name: true } },
        },
      },
    },
  });

  const finePolicy = await db.lateFinePolicy.findFirst({ where: { schoolId, isActive: true } });

  // Roll invoices up per student: a parent gets one phone call, not four.
  type Row = {
    studentId: string;
    name: string;
    admissionNumber: string;
    className: string;
    sequenceOrder: number;
    sectionName: string;
    phone: string | null;
    fatherName: string | null;
    outstanding: number;
    projectedFine: number;
    oldestDueDate: Date;
    daysOverdue: number;
    bucket: string;
    invoiceCount: number;
    terms: string[];
  };

  const byStudent = new Map<string, Row>();

  for (const inv of invoices) {
    const out = outstandingOf(inv);
    if (out <= 0) continue;

    const fine = lateFineFor({
      dueDate: inv.dueDate,
      asOf,
      outstanding: out,
      rule: finePolicy
        ? {
            graceDays: finePolicy.graceDays,
            perDayAmount: finePolicy.perDayAmount,
            flatAmount: finePolicy.flatAmount,
            maxAmount: finePolicy.maxAmount,
          }
        : null,
    });

    const existing = byStudent.get(inv.studentId);
    if (existing) {
      existing.outstanding += out;
      existing.projectedFine += fine;
      existing.invoiceCount += 1;
      if (inv.label) existing.terms.push(inv.label);
      if (inv.dueDate < existing.oldestDueDate) existing.oldestDueDate = inv.dueDate;
    } else {
      byStudent.set(inv.studentId, {
        studentId: inv.studentId,
        name: inv.student.name,
        admissionNumber: inv.student.admissionNumber,
        className: inv.student.class?.name ?? "—",
        sequenceOrder: inv.student.class?.sequenceOrder ?? 99,
        sectionName: inv.student.section?.name ?? "",
        phone: inv.student.guardianPhone,
        fatherName: inv.student.fatherName,
        outstanding: out,
        projectedFine: fine,
        oldestDueDate: inv.dueDate,
        daysOverdue: 0,
        bucket: "CURRENT",
        invoiceCount: 1,
        terms: inv.label ? [inv.label] : [],
      });
    }
  }

  let rows = [...byStudent.values()].map((r) => {
    const days = daysBetween(r.oldestDueDate, asOf);
    return { ...r, daysOverdue: Math.max(0, days), bucket: ageBucket(days) };
  });

  if (filters.bucket) rows = rows.filter((r) => r.bucket === filters.bucket);
  if (filters.minAmount) rows = rows.filter((r) => r.outstanding >= filters.minAmount!);

  rows.sort((a, b) => b.daysOverdue - a.daysOverdue || b.outstanding - a.outstanding);

  const summary = summariseDues(
    invoices.map((i) => ({
      amount: i.amount,
      paidAmount: i.paidAmount,
      status: i.status,
      dueDate: i.dueDate,
    })),
    asOf,
  );

  // Class-wise roll-up, because the principal delegates by class teacher.
  const byClass = new Map<string, { className: string; sequenceOrder: number; students: number; outstanding: number }>();
  for (const r of rows) {
    const k = r.className;
    const prev = byClass.get(k) ?? { className: k, sequenceOrder: r.sequenceOrder, students: 0, outstanding: 0 };
    prev.students += 1;
    prev.outstanding += r.outstanding;
    byClass.set(k, prev);
  }

  return {
    rows,
    summary,
    classSummary: [...byClass.values()].sort((a, b) => a.sequenceOrder - b.sequenceOrder),
    finePolicy,
  };
}

/** Year-to-date money position for the fees home screen. */
export async function getFeeTotals(schoolId: string, asOf = new Date()) {
  const invoices = await db.feeInvoice.findMany({
    where: { schoolId, status: { not: "CANCELLED" } },
    select: { amount: true, paidAmount: true, status: true, dueDate: true, grossAmount: true, concessionAmount: true },
  });

  const billed = invoices.reduce((a, i) => a + i.amount, 0);
  const collected = invoices.reduce((a, i) => a + i.paidAmount, 0);
  const concession = invoices.reduce((a, i) => a + i.concessionAmount, 0);
  const dues = summariseDues(invoices, asOf);

  return {
    billed,
    collected,
    concession,
    collectedBp: billed > 0 ? Math.round((collected / billed) * 10000) : 0,
    ...dues,
    invoiceCount: invoices.length,
  };
}

/** One student's fee position, for the counter. */
export async function getStudentFeePosition(schoolId: string, studentId: string, asOf = new Date()) {
  const [student, invoices, payments, finePolicy, school] = await Promise.all([
    db.student.findFirst({
      where: { id: studentId, schoolId },
      select: {
        id: true, name: true, admissionNumber: true, guardianPhone: true, fatherName: true,
        class: { select: { name: true } }, section: { select: { name: true } },
        concessions: { include: { concessionType: true } },
      },
    }),
    db.feeInvoice.findMany({
      where: { studentId, schoolId, status: { in: ["UNPAID", "PARTIAL"] } },
      orderBy: { dueDate: "asc" },
    }),
    db.feePayment.findMany({
      where: { studentId, reversedAt: null },
      orderBy: { paidAt: "desc" },
      take: 5,
      include: { receipt: true },
    }),
    db.lateFinePolicy.findFirst({ where: { schoolId, isActive: true } }),
    db.school.findUnique({ where: { id: schoolId }, select: { upiId: true, upiPayeeName: true, name: true } }),
  ]);

  if (!student) return null;

  const rule = finePolicy
    ? {
        graceDays: finePolicy.graceDays,
        perDayAmount: finePolicy.perDayAmount,
        flatAmount: finePolicy.flatAmount,
        maxAmount: finePolicy.maxAmount,
      }
    : null;

  const withFine = invoices.map((inv) => {
    const balance = outstandingOf(inv);
    return {
      ...inv,
      balance,
      fine: lateFineFor({ dueDate: inv.dueDate, asOf, outstanding: balance, rule }),
      daysOverdue: Math.max(0, daysBetween(inv.dueDate, asOf)),
    };
  });

  return {
    student,
    invoices: withFine,
    payments,
    totalDue: withFine.reduce((a, i) => a + i.balance, 0),
    totalFine: withFine.reduce((a, i) => a + i.fine, 0),
    upi: school?.upiId ? { id: school.upiId, payee: school.upiPayeeName ?? school.name } : null,
  };
}

/** Today at the counter: what came in, by whom, in what form. */
export async function getDayBook(schoolId: string, date: Date) {
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const [payments, closeout] = await Promise.all([
    db.feePayment.findMany({
      where: { schoolId, paidAt: { gte: dayStart, lt: dayEnd }, reversedAt: null },
      orderBy: { paidAt: "desc" },
      include: {
        receipt: true,
        student: {
          select: {
            name: true, admissionNumber: true,
            class: { select: { name: true } }, section: { select: { name: true } },
          },
        },
      },
    }),
    db.collectionCloseout.findUnique({ where: { schoolId_date: { schoolId, date: dayStart } } }),
  ]);

  const byMode = new Map<string, { count: number; amount: number }>();
  for (const p of payments) {
    const prev = byMode.get(p.mode) ?? { count: 0, amount: 0 };
    byMode.set(p.mode, { count: prev.count + 1, amount: prev.amount + p.amount });
  }

  const cashModes = ["CASH"];
  const total = payments.reduce((a, p) => a + p.amount, 0);
  const cash = payments.filter((p) => cashModes.includes(p.mode)).reduce((a, p) => a + p.amount, 0);
  const cheque = payments.filter((p) => p.mode === "CHEQUE" || p.mode === "DD").reduce((a, p) => a + p.amount, 0);

  return {
    date: dayStart,
    payments,
    byMode: [...byMode.entries()].map(([mode, v]) => ({ mode, ...v })).sort((a, b) => b.amount - a.amount),
    total,
    cash,
    cheque,
    online: total - cash - cheque,
    closeout,
  };
}

/**
 * Everything needed to bill one term, gathered once.
 *
 * The preview screen and the action that actually writes the invoices both read
 * this and both hand it to planTermBilling — so the total a school is shown before
 * it commits is computed by the same code that commits it. Two separate gathers
 * would be two chances to differ, and the one place a school must be able to trust
 * an amount is the moment before it bills 800 families.
 */
export async function gatherTermBilling(schoolId: string, label: string) {
  const year = await db.academicYear.findFirst({
    where: { schoolId, isCurrent: true },
    select: { id: true, name: true },
  });
  if (!year) return null;

  const [heads, structures, plans, students, transport, concessions] = await Promise.all([
    db.feeHead.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    db.feeStructure.findMany({
      where: { schoolId, academicYearId: year.id, isActive: true },
      select: { id: true, classId: true, items: { select: { feeHeadId: true, amount: true } } },
    }),
    db.installmentPlan.findMany({
      where: { schoolId, feeStructure: { academicYearId: year.id, isActive: true } },
      // Ordered, because termLabels is built from this and a school reads its terms
      // in the order they fall due — not in whatever order Postgres returns them.
      orderBy: [{ sequenceOrder: "asc" }, { dueDate: "asc" }],
      select: { id: true, label: true, dueDate: true, feeStructureId: true },
    }),
    db.student.findMany({
      where: { schoolId, status: "ACTIVE" },
      orderBy: [{ class: { sequenceOrder: "asc" } }, { rollNumber: "asc" }],
      select: { id: true, name: true, classId: true, class: { select: { name: true } } },
    }),
    db.studentTransport.findMany({
      where: { schoolId, OR: [{ toDate: null }, { toDate: { gte: new Date() } }] },
      select: { studentId: true, stop: { select: { monthlyFee: true } } },
    }),
    db.studentConcession.findMany({
      where: { schoolId },
      select: {
        studentId: true, percentage: true, fixedAmount: true, approvedAt: true,
        concessionType: {
          select: { name: true, percentage: true, fixedAmount: true, requiresApproval: true, appliesToHeads: true },
        },
      },
    }),
  ]);

  const headName = new Map(heads.map((h) => [h.id, h.name]));
  const termLabels = [...new Set(plans.map((p) => p.label))];
  const termCount = termLabels.length;

  // The term's own installment row, per class. Terms are stored per fee structure,
  // so a class with no structure has no copy of this term and cannot be billed.
  const planByStructure = new Map(plans.filter((p) => p.label === label).map((p) => [p.feeStructureId, p]));
  const structureByClass = new Map(structures.filter((s) => s.classId).map((s) => [s.classId!, s]));

  const linesByClass = new Map<string, FeeLine[]>();
  const transportHeadPriced = new Set<string>();
  for (const s of structures) {
    if (!s.classId) continue;
    linesByClass.set(
      s.classId,
      s.items.map((i) => ({ head: headName.get(i.feeHeadId) ?? "Fee", amount: i.amount })),
    );
    if (s.items.some((i) => headName.get(i.feeHeadId) === "Transport")) transportHeadPriced.add(s.classId);
  }

  // Transport is charged per stop, not per class, so it is added from the child's
  // own stop — unless the class already prices a Transport head, in which case
  // adding it again would bill the same bus twice.
  const busAnnual = new Map<string, number>();
  for (const t of transport) {
    const monthly = t.stop?.monthlyFee ?? 0;
    if (monthly > 0) busAnnual.set(t.studentId, monthly * 12);
  }

  const rulesByStudent = new Map<string, ConcessionRule[]>();
  let unapproved = 0;
  for (const c of concessions) {
    if (c.concessionType.requiresApproval && !c.approvedAt) {
      // A concession nobody has approved is not applied. It is not silently
      // dropped either — the preview says how many are waiting.
      unapproved += 1;
      continue;
    }
    const rule: ConcessionRule = {
      label: c.concessionType.name,
      percentage: c.percentage ?? c.concessionType.percentage ?? undefined,
      fixedAmount: c.fixedAmount ?? c.concessionType.fixedAmount ?? undefined,
      heads: c.concessionType.appliesToHeads.map((id) => headName.get(id)).filter((n): n is string => Boolean(n)),
    };
    if (!rule.percentage && !rule.fixedAmount) continue;
    const at = rulesByStudent.get(c.studentId) ?? [];
    at.push(rule);
    rulesByStudent.set(c.studentId, at);
  }

  const raised = new Set(
    (
      await db.feeInvoice.findMany({
        where: {
          schoolId,
          installmentPlanId: { in: [...planByStructure.values()].map((p) => p.id) },
          cancelledAt: null,
        },
        select: { studentId: true },
      })
    ).map((i) => i.studentId),
  );

  const candidates = students.map((s) => {
    const structure = s.classId ? structureByClass.get(s.classId) : undefined;
    const plan = structure ? planByStructure.get(structure.id) : undefined;
    const base = (s.classId ? linesByClass.get(s.classId) : undefined) ?? [];
    const bus = s.classId && !transportHeadPriced.has(s.classId) ? (busAnnual.get(s.id) ?? 0) : 0;
    return {
      studentId: s.id,
      name: s.name,
      className: s.class?.name ?? "—",
      classId: s.classId,
      planId: plan?.id ?? null,
      dueDate: plan?.dueDate ?? null,
      lines: bus > 0 ? [...base, { head: "Transport", amount: bus }] : base,
      concessions: rulesByStudent.get(s.id) ?? [],
      alreadyRaised: raised.has(s.id),
      eligible: Boolean(plan) && base.length > 0,
    };
  });

  return { year, label, termLabels, termCount, share: termCount > 0 ? 1 / termCount : 1, candidates, unapproved };
}
