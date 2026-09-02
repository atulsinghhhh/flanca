import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import { reserveNumbers, nextNumber } from "@/lib/sequence";
import { statusAfterPayment, toRupee, planTermBilling } from "@/lib/core/fees-core";
import { formatMoney } from "@/lib/core/money";
import { gatherTermBilling } from "@/lib/queries/fees";
import { schoolToday } from "@/lib/queries/when";
import type { PaymentMode } from "@prisma/client";

/**
 * The mobile-API twin of src/app/app/fees/actions.ts (collect/reverse/remind)
 * and src/app/app/fees/raise/actions.ts (raiseTermInvoices) — same db writes,
 * same audit trail, same arithmetic from fees-core/money, just handed an
 * `actor` instead of calling `requireRole()`, and returning a discriminated
 * result instead of `{error}`/`{ok}` so a route handler can pick the right
 * HTTP status. revalidatePath is dropped — nothing to invalidate for a
 * stateless JSON client.
 */

type Failure = { ok: false; status: number; code: string; message: string };

const notFound = (message: string): Failure => ({ ok: false, status: 404, code: "not_found", message });
const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });
const conflict = (message: string): Failure => ({ ok: false, status: 409, code: "conflict", message });

/** Thrown inside collectPayment's transaction so the outer catch can map it to a real status. */
class PaymentError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type Allocation = { invoiceId: string; amount: number; lateFee?: number };

/**
 * The counter sends a date-only value. Taken literally that is midnight UTC,
 * which prints "5:30 am" on every receipt collected during the school day. So
 * today keeps the real clock time, and a back-dated entry lands at midday.
 */
function resolvePaidAt(input?: string): Date | null {
  if (!input) return new Date();

  const parsed = new Date(`${input}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  const now = new Date();
  const isToday =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate();

  if (isToday) return now;
  parsed.setHours(12, 0, 0, 0);
  return parsed;
}

export type CollectPaymentInput = {
  studentId: string;
  allocations: Allocation[];
  mode: PaymentMode;
  reference?: string;
  bankName?: string;
  note?: string;
  paidAt?: string;
};

export type CollectPaymentResult = Failure | { ok: true; receiptIds: string[]; collected: number };

/** Mirrors src/app/app/fees/actions.ts::collectPayment. */
export async function collectPaymentForActor(actor: Actor, input: CollectPaymentInput): Promise<CollectPaymentResult> {
  const student = await db.student.findFirst({
    where: { id: input.studentId, schoolId: actor.schoolId },
    select: { id: true, name: true, admissionNumber: true, class: { select: { name: true } }, section: { select: { name: true } } },
  });
  if (!student) return notFound("That student is not on this school's roll.");

  const clean = input.allocations
    .map((a) => ({ ...a, amount: toRupee(a.amount), lateFee: toRupee(a.lateFee ?? 0) }))
    .filter((a) => a.amount > 0 || a.lateFee > 0);

  if (clean.length === 0) return invalid("Enter an amount to collect.");
  if ((input.mode === "CHEQUE" || input.mode === "DD") && !input.reference?.trim()) {
    return invalid("Enter the cheque or DD number.");
  }

  const paidAt = resolvePaidAt(input.paidAt);
  if (!paidAt) return invalid("That payment date is not valid.");
  if (paidAt.getTime() > Date.now() + 60_000) return invalid("A payment cannot be dated in the future.");

  const receiptIds: string[] = [];
  let collected = 0;

  try {
    await db.$transaction(async (tx) => {
      for (const alloc of clean) {
        const invoice = await tx.feeInvoice.findFirst({
          where: { id: alloc.invoiceId, schoolId: actor.schoolId, studentId: student.id },
        });
        if (!invoice) throw new PaymentError(404, "not_found", "One of those invoices no longer exists.");
        if (invoice.status === "CANCELLED") {
          throw new PaymentError(409, "conflict", `Invoice ${invoice.invoiceNumber} was cancelled.`);
        }

        let amountDue = invoice.amount;
        if (alloc.lateFee > 0) {
          amountDue = invoice.amount + alloc.lateFee;
          await tx.feeInvoice.update({
            where: { id: invoice.id },
            data: { lateFeeAmount: invoice.lateFeeAmount + alloc.lateFee, amount: amountDue },
          });
        }

        const received = alloc.amount + alloc.lateFee;

        const outstanding = amountDue - invoice.paidAmount;
        if (received > outstanding) {
          throw new PaymentError(
            422,
            "invalid_input",
            `${formatMoney(received)} is more than the ${formatMoney(outstanding)} outstanding on ${invoice.invoiceNumber}.`,
          );
        }

        const payment = await tx.feePayment.create({
          data: {
            schoolId: actor.schoolId,
            studentId: student.id,
            invoiceId: invoice.id,
            amount: received,
            mode: input.mode,
            reference: input.reference?.trim() || null,
            bankName: input.bankName?.trim() || null,
            paidAt,
            collectedBy: actor.id,
            note: input.note?.trim() || null,
          },
        });

        const newPaid = invoice.paidAmount + received;
        await tx.feeInvoice.update({
          where: { id: invoice.id },
          data: { paidAmount: newPaid, status: statusAfterPayment(amountDue, newPaid) },
        });

        const receiptNumber = await nextNumber(tx, actor.schoolId, "RECEIPT", "RCP/");

        const receipt = await tx.receipt.create({
          data: {
            schoolId: actor.schoolId,
            paymentId: payment.id,
            receiptNumber,
            issuedAt: paidAt,
            snapshot: {
              studentName: student.name,
              admissionNumber: student.admissionNumber,
              className: `${student.class?.name ?? ""} ${student.section?.name ?? ""}`.trim(),
              invoiceNumber: invoice.invoiceNumber,
              term: invoice.label,
              lineItems: invoice.lineItems,
              invoiceAmount: amountDue,
              lateFee: alloc.lateFee,
              amountPaid: received,
              balanceAfter: amountDue - newPaid,
              mode: input.mode,
              reference: input.reference?.trim() || null,
              collectedByName: actor.name,
              paidAt: paidAt.toISOString(),
            } as never,
          },
        });

        receiptIds.push(receipt.id);
        collected += received;
      }
    });
  } catch (e) {
    if (e instanceof PaymentError) return { ok: false, status: e.status, code: e.code, message: e.message };
    return invalid(e instanceof Error ? e.message : "Could not record that payment.");
  }

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.payment.collect",
    entity: "Student",
    entityId: student.id,
    summary: `Collected ${formatMoney(collected)} from ${student.name} (${student.admissionNumber}) by ${input.mode}`,
    after: { collected, mode: input.mode, receiptIds },
  });

  return { ok: true, receiptIds, collected };
}

export type ReversePaymentResult = Failure | { ok: true };

/** Mirrors src/app/app/fees/actions.ts::reversePayment. Never deleted — a receipt was printed. */
export async function reversePaymentForActor(actor: Actor, paymentId: string, reason: string): Promise<ReversePaymentResult> {
  if (!reason.trim()) return invalid("Give a reason for the reversal.");

  const payment = await db.feePayment.findFirst({
    where: { id: paymentId, schoolId: actor.schoolId },
    include: { invoice: true, receipt: true, student: { select: { name: true } } },
  });
  if (!payment) return notFound("That payment no longer exists.");
  if (payment.reversedAt) return conflict("That payment was already reversed.");

  await db.$transaction(async (tx) => {
    await tx.feePayment.update({
      where: { id: payment.id },
      data: { reversedAt: new Date(), reverseReason: reason.trim() },
    });

    if (payment.invoice) {
      const newPaid = Math.max(0, payment.invoice.paidAmount - payment.amount);
      await tx.feeInvoice.update({
        where: { id: payment.invoice.id },
        data: { paidAmount: newPaid, status: statusAfterPayment(payment.invoice.amount, newPaid) },
      });
    }
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.payment.reverse",
    entity: "FeePayment",
    entityId: payment.id,
    summary: `Reversed ${formatMoney(payment.amount)} (receipt ${payment.receipt?.receiptNumber ?? "—"}) for ${payment.student.name}: ${reason.trim()}`,
    before: { amount: payment.amount },
  });

  return { ok: true };
}

export type SendFeeRemindersResult = Failure | { ok: true; queued: number; skipped: number };

/** Mirrors src/app/app/fees/actions.ts::sendFeeReminders. */
export async function sendFeeRemindersForActor(
  actor: Actor,
  studentIds: string[],
  channel: "IN_APP" | "WHATSAPP" | "SMS",
): Promise<SendFeeRemindersResult> {
  if (studentIds.length === 0) return invalid("Select at least one parent.");

  const students = await db.student.findMany({
    where: { id: { in: studentIds }, schoolId: actor.schoolId },
    select: {
      id: true, name: true, guardianPhone: true,
      invoices: { where: { status: { in: ["UNPAID", "PARTIAL"] } }, select: { amount: true, paidAmount: true, label: true } },
    },
  });

  let queued = 0;
  let skipped = 0;

  for (const s of students) {
    const due = s.invoices.reduce((a, i) => a + (i.amount - i.paidAmount), 0);
    if (due <= 0) continue;

    if (channel !== "IN_APP" && !s.guardianPhone) {
      skipped++;
      continue;
    }

    await db.messageLog.create({
      data: {
        schoolId: actor.schoolId,
        channel,
        recipient: channel === "IN_APP" ? s.id : (s.guardianPhone ?? ""),
        template: "fee_due",
        body: `Dear Parent, ${formatMoney(due)} is pending for ${s.name}. Pay by UPI directly to the school — no convenience fee. — Nalanda Public School`,
        status: channel === "IN_APP" ? "SENT" : "QUEUED",
        sentAt: channel === "IN_APP" ? new Date() : null,
        costPaise: channel === "WHATSAPP" ? 25 : channel === "SMS" ? 18 : 0,
      },
    });

    await db.feeReminderLog.create({
      data: { schoolId: actor.schoolId, studentId: s.id, channel },
    });
    queued++;
  }

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.reminder.send",
    entity: "School",
    entityId: actor.schoolId,
    summary: `Queued ${queued} fee reminder${queued === 1 ? "" : "s"} by ${channel}${skipped ? `, skipped ${skipped} without a mobile number` : ""}`,
  });

  return { ok: true, queued, skipped };
}

export type RaiseTermInvoicesResult = Failure | { ok: true; raised: number; net: number };

/** Mirrors src/app/app/fees/raise/actions.ts::raiseTermInvoices. */
export async function raiseTermInvoicesForActor(
  actor: Actor,
  input: { label: string; expectedCount: number },
): Promise<RaiseTermInvoicesResult> {
  const gathered = await gatherTermBilling(actor.schoolId, input.label);
  if (!gathered) return notFound("There is no current academic year, so there is no term to raise.");
  if (gathered.termCount === 0) return notFound("This year has no terms set up yet.");
  if (!gathered.termLabels.includes(input.label)) return notFound(`No class has a term called ${input.label}.`);

  const plan = planTermBilling({ candidates: gathered.candidates, share: gathered.share });
  if (plan.toRaise.length === 0) {
    return conflict(`Every eligible student already has an invoice for ${input.label}. Nothing to raise.`);
  }

  if (input.expectedCount !== plan.toRaise.length) {
    return conflict(
      `This would now raise ${plan.toRaise.length} invoices, not ${input.expectedCount}. Something changed — check the list and try again.`,
    );
  }

  const byStudent = new Map(gathered.candidates.map((c) => [c.studentId, c]));
  const issueDate = schoolToday();

  await db.$transaction(
    async (tx) => {
      const numbers = await reserveNumbers(
        tx,
        actor.schoolId,
        "INVOICE",
        plan.toRaise.length,
        `INV/${gathered.year.name.replace(/^20/, "").replace(/-20/, "-")}/`,
      );

      await tx.feeInvoice.createMany({
        data: plan.toRaise.map((r, i) => {
          const c = byStudent.get(r.studentId)!;
          return {
            schoolId: actor.schoolId,
            academicYearId: gathered.year.id,
            studentId: r.studentId,
            installmentPlanId: c.planId,
            invoiceNumber: numbers[i],
            label: input.label,
            lineItems: r.totals.lines.map((l) => ({
              head: l.head,
              amount: l.amount,
              concession: l.concession ?? 0,
            })),
            grossAmount: r.totals.gross,
            concessionAmount: r.totals.concession,
            amount: r.totals.net,
            issueDate,
            dueDate: c.dueDate!,
            status: "UNPAID" as const,
          };
        }),
      });
    },
    { timeout: 30_000 },
  );

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.invoice.raise",
    entity: "InstallmentPlan",
    entityId: input.label,
    summary:
      `Raised ${plan.toRaise.length} invoices for ${input.label}, ${formatMoney(plan.net)} in all` +
      (plan.concession > 0 ? ` after ${formatMoney(plan.concession)} of concessions` : "") +
      (plan.alreadyRaised > 0 ? `. ${plan.alreadyRaised} already had one and were left alone` : "") +
      ".",
    after: {
      term: input.label,
      invoices: plan.toRaise.length,
      gross: plan.gross,
      concession: plan.concession,
      net: plan.net,
    },
  });

  return { ok: true, raised: plan.toRaise.length, net: plan.net };
}
