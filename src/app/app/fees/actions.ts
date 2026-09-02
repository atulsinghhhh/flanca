"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, MONEY, OFFICE } from "@/lib/session";
import { nextNumber } from "@/lib/sequence";
import { statusAfterPayment, toRupee } from "@/lib/core/fees-core";
import { formatMoney } from "@/lib/core/money";
import type { PaymentMode } from "@prisma/client";

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

/**
 * Take money at the counter.
 *
 * One FeePayment row per invoice so the ledger and the invoice history stay
 * exact, each with its own gap-free receipt number. The whole thing is one
 * transaction: a school must never end up with a receipt for money that was
 * not recorded, or money recorded without a receipt.
 */
export async function collectPayment(input: {
  studentId: string;
  allocations: Allocation[];
  mode: PaymentMode;
  reference?: string;
  bankName?: string;
  note?: string;
  paidAt?: string;
}) {
  const actor = await requireRole(...MONEY);

  const student = await db.student.findFirst({
    where: { id: input.studentId, schoolId: actor.schoolId },
    select: { id: true, name: true, admissionNumber: true, class: { select: { name: true } }, section: { select: { name: true } } },
  });
  if (!student) return { error: "That student is not on this school's roll." };

  const clean = input.allocations
    .map((a) => ({ ...a, amount: toRupee(a.amount), lateFee: toRupee(a.lateFee ?? 0) }))
    .filter((a) => a.amount > 0 || a.lateFee > 0);

  if (clean.length === 0) return { error: "Enter an amount to collect." };
  if ((input.mode === "CHEQUE" || input.mode === "DD") && !input.reference?.trim()) {
    return { error: "Enter the cheque or DD number." };
  }

  const paidAt = resolvePaidAt(input.paidAt);
  if (!paidAt) return { error: "That payment date is not valid." };
  if (paidAt.getTime() > Date.now() + 60_000) return { error: "A payment cannot be dated in the future." };

  const receiptIds: string[] = [];
  let collected = 0;

  try {
    await db.$transaction(async (tx) => {
      for (const alloc of clean) {
        const invoice = await tx.feeInvoice.findFirst({
          where: { id: alloc.invoiceId, schoolId: actor.schoolId, studentId: student.id },
        });
        if (!invoice) throw new Error("One of those invoices no longer exists.");
        if (invoice.status === "CANCELLED") throw new Error(`Invoice ${invoice.invoiceNumber} was cancelled.`);

        // A late fee is only ever added deliberately, and it changes the invoice
        // itself so the parent's copy and ours always agree.
        let amountDue = invoice.amount;
        if (alloc.lateFee > 0) {
          amountDue = invoice.amount + alloc.lateFee;
          await tx.feeInvoice.update({
            where: { id: invoice.id },
            data: { lateFeeAmount: invoice.lateFeeAmount + alloc.lateFee, amount: amountDue },
          });
        }

        // A ticked late fee is money the clerk is taking across the counter right
        // now, so it must be part of the RECORDED payment — not merely added to
        // the invoice. Otherwise the cash box is short by the fine.
        const received = alloc.amount + alloc.lateFee;

        const outstanding = amountDue - invoice.paidAmount;
        if (received > outstanding) {
          throw new Error(
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

        // The snapshot is frozen: a reprint next year must be identical to the
        // paper the parent is holding today.
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
    return { error: e instanceof Error ? e.message : "Could not record that payment." };
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

  revalidatePath("/app/fees");
  revalidatePath("/app/accounts");
  revalidatePath(`/app/students/${student.id}`);

  return { ok: true, receiptIds, collected };
}

/** Reverse a wrongly-entered payment. Never deleted — a receipt was printed. */
export async function reversePayment(paymentId: string, reason: string) {
  const actor = await requireRole(...MONEY);
  if (!reason.trim()) return { error: "Give a reason for the reversal." };

  const payment = await db.feePayment.findFirst({
    where: { id: paymentId, schoolId: actor.schoolId },
    include: { invoice: true, receipt: true, student: { select: { name: true } } },
  });
  if (!payment) return { error: "That payment no longer exists." };
  if (payment.reversedAt) return { error: "That payment was already reversed." };

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

  revalidatePath("/app/fees");
  revalidatePath("/app/accounts");
  return { ok: true };
}

/**
 * Cancel a wrongly-raised invoice. Only ever before a rupee has been collected
 * against it — once money has moved, the invoice stays and the payment is what
 * gets reversed instead, so the ledger never has a gap nobody can explain.
 */
export async function cancelInvoice(invoiceId: string, reason: string) {
  const actor = await requireRole(...OFFICE);
  if (!reason.trim()) return { error: "Give a reason for cancelling this invoice." };

  const invoice = await db.feeInvoice.findFirst({
    where: { id: invoiceId, schoolId: actor.schoolId },
    include: { student: { select: { name: true, admissionNumber: true } } },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "CANCELLED") return { error: "That invoice was already cancelled." };
  if (invoice.paidAmount > 0) {
    return {
      error: `${formatMoney(invoice.paidAmount)} is already collected against ${invoice.invoiceNumber} — reverse the payment first, or cancel a different invoice.`,
    };
  }

  await db.feeInvoice.update({
    where: { id: invoice.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason.trim() },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.invoice.cancel",
    entity: "FeeInvoice",
    entityId: invoice.id,
    summary: `Cancelled invoice ${invoice.invoiceNumber} (${formatMoney(invoice.amount)}) for ${invoice.student.name} (${invoice.student.admissionNumber}): ${reason.trim()}`,
    before: { status: invoice.status, amount: invoice.amount },
  });

  revalidatePath("/app/fees");
  revalidatePath(`/app/students/${invoice.studentId}`);
  return { ok: true as const };
}

/**
 * Close the day's cash. The variance is recorded, not hidden — that is the whole
 * point of a closeout, and it is what an auditor asks for.
 */
export async function closeTheDay(input: { date: string; cashCounted: number; note?: string }) {
  const actor = await requireRole(...MONEY);

  const day = new Date(input.date);
  if (Number.isNaN(day.getTime())) return { error: "That date is not valid." };
  const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const payments = await db.feePayment.findMany({
    where: { schoolId: actor.schoolId, paidAt: { gte: dayStart, lt: dayEnd }, reversedAt: null },
    select: { id: true, amount: true, mode: true },
  });

  const cashExpected = payments.filter((p) => p.mode === "CASH").reduce((a, p) => a + p.amount, 0);
  const chequeTotal = payments.filter((p) => p.mode === "CHEQUE" || p.mode === "DD").reduce((a, p) => a + p.amount, 0);
  const onlineTotal = payments
    .filter((p) => !["CASH", "CHEQUE", "DD"].includes(p.mode))
    .reduce((a, p) => a + p.amount, 0);

  const cashCounted = toRupee(input.cashCounted);
  const variance = cashCounted - cashExpected;

  const closeout = await db.collectionCloseout.upsert({
    where: { schoolId_date: { schoolId: actor.schoolId, date: dayStart } },
    create: {
      schoolId: actor.schoolId, date: dayStart, closedBy: actor.id,
      cashExpected, cashCounted, chequeTotal, onlineTotal, variance,
      note: input.note?.trim() || null,
    },
    update: {
      cashExpected, cashCounted, chequeTotal, onlineTotal, variance,
      closedBy: actor.id, note: input.note?.trim() || null, closedAt: new Date(),
    },
  });

  await db.feePayment.updateMany({
    where: { id: { in: payments.map((p) => p.id) } },
    data: { closeoutId: closeout.id },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.closeout",
    entity: "CollectionCloseout",
    entityId: closeout.id,
    summary:
      variance === 0
        ? `Day closed: cash ${formatMoney(cashCounted)} tallies exactly`
        : `Day closed with a variance of ${formatMoney(variance)} (expected ${formatMoney(cashExpected)}, counted ${formatMoney(cashCounted)})`,
    after: { cashExpected, cashCounted, variance },
  });

  revalidatePath("/app/accounts");
  return { ok: true, variance, cashExpected };
}

/**
 * Log a fee reminder. In-app and the message log are free; WhatsApp/SMS credits
 * are only spent when the school has configured a provider.
 */
export async function sendFeeReminders(studentIds: string[], channel: "IN_APP" | "WHATSAPP" | "SMS") {
  const actor = await requireRole(...MONEY);
  if (studentIds.length === 0) return { error: "Select at least one parent." };

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
        // Nothing is claimed as delivered that a provider has not accepted.
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

  revalidatePath("/app/fees");
  return { ok: true, queued, skipped };
}
