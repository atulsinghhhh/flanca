import { db } from "@/lib/db";
import { audit, hasRole, type Actor } from "@/lib/session";
import { nextNumber } from "@/lib/sequence";
import { statusAfterPayment, outstandingOf } from "@/lib/core/fees-core";
import { verifyRazorpaySignature } from "@/lib/core/payments-core";
import { createRazorpayOrder, razorpayKeyId } from "@/lib/razorpay";
import { formatMoney } from "@/lib/core/money";

/**
 * The self-serve twin of src/app/app/fees/actions.ts::collectPayment — same
 * invariants (gap-free receipt number, frozen snapshot, invoice status
 * recomputed inside the transaction), but the counter clerk is replaced by a
 * verified gateway signature, and the payer is the student or their parent
 * rather than office staff. Office's own collection flow is untouched.
 */

type Failure = { ok: false; status: number; code: string; message: string };
const notFound = (message: string): Failure => ({ ok: false, status: 404, code: "not_found", message });
const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });
const conflict = (message: string): Failure => ({ ok: false, status: 409, code: "conflict", message });
const forbidden = (message: string): Failure => ({ ok: false, status: 403, code: "forbidden", message });

/** Is this actor allowed to pay for this student — themselves, or a linked parent. */
async function resolvePayableStudent(actor: Actor, studentId: string) {
  if (hasRole(actor, "STUDENT")) {
    return db.student.findFirst({
      where: { id: studentId, schoolId: actor.schoolId, userId: actor.id },
      select: { id: true, name: true, admissionNumber: true, class: { select: { name: true } }, section: { select: { name: true } } },
    });
  }
  if (hasRole(actor, "PARENT")) {
    const link = await db.parentLink.findFirst({
      where: { studentId, schoolId: actor.schoolId, userId: actor.id },
      select: {
        student: {
          select: { id: true, name: true, admissionNumber: true, class: { select: { name: true } }, section: { select: { name: true } } },
        },
      },
    });
    return link?.student ?? null;
  }
  return null;
}

export type CreatePaymentOrderResult =
  | Failure
  | {
      ok: true;
      paymentOrderId: string;
      razorpayOrderId: string;
      amount: number;
      currency: "INR";
      keyId: string;
      studentName: string;
      schoolName: string;
    };

/** Start a payment attempt: a fresh Razorpay order for exactly what's owed right now. */
export async function createPaymentOrderForActor(
  actor: Actor,
  input: { studentId: string; invoiceId: string },
): Promise<CreatePaymentOrderResult> {
  if (!hasRole(actor, "STUDENT", "PARENT")) return forbidden("Only a student or their parent can pay this way.");

  const student = await resolvePayableStudent(actor, input.studentId);
  if (!student) return notFound("That student is not on this account.");

  const [invoice, school] = await Promise.all([
    db.feeInvoice.findFirst({ where: { id: input.invoiceId, schoolId: actor.schoolId, studentId: student.id } }),
    db.school.findUnique({ where: { id: actor.schoolId }, select: { name: true } }),
  ]);
  if (!invoice) return notFound("That invoice no longer exists.");

  // Never the client's number — the amount charged is always what the ledger
  // says is actually outstanding at this instant.
  const outstanding = outstandingOf(invoice);
  if (outstanding <= 0) return invalid("There is nothing outstanding on this invoice.");

  const paymentOrder = await db.paymentOrder.create({
    data: {
      schoolId: actor.schoolId,
      studentId: student.id,
      invoiceId: invoice.id,
      amount: outstanding,
      method: "GATEWAY",
      status: "CREATED",
    },
  });

  let razorpayOrder;
  try {
    razorpayOrder = await createRazorpayOrder({
      amountPaise: outstanding,
      receipt: paymentOrder.id,
      notes: { studentId: student.id, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
    });
  } catch (e) {
    await db.paymentOrder.update({
      where: { id: paymentOrder.id },
      data: { status: "FAILED", failureReason: e instanceof Error ? e.message : "Could not reach the payment gateway." },
    });
    return { ok: false, status: 502, code: "gateway_error", message: "Could not start the payment. Try again in a moment." };
  }

  await db.paymentOrder.update({
    where: { id: paymentOrder.id },
    data: { gatewayOrderId: razorpayOrder.id },
  });

  return {
    ok: true,
    paymentOrderId: paymentOrder.id,
    razorpayOrderId: razorpayOrder.id,
    amount: outstanding,
    currency: "INR",
    keyId: razorpayKeyId(),
    studentName: student.name,
    schoolName: school?.name ?? "School",
  };
}

export type ConfirmPaymentResult =
  | Failure
  | { ok: true; receiptId: string; amount: number };

/**
 * The step that stands in for a webhook: verify the signature Razorpay's
 * checkout widget handed back, and only then does any money actually get
 * recorded. An unverified or mismatched signature fails closed — no
 * FeePayment, no Receipt, no change to the invoice.
 */
export async function confirmPaymentForActor(
  actor: Actor,
  input: { paymentOrderId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
): Promise<ConfirmPaymentResult> {
  if (!hasRole(actor, "STUDENT", "PARENT")) return forbidden("Only a student or their parent can confirm this payment.");

  const paymentOrder = await db.paymentOrder.findFirst({
    where: { id: input.paymentOrderId, schoolId: actor.schoolId },
    include: { invoice: true },
  });
  if (!paymentOrder) return notFound("That payment attempt no longer exists.");

  const student = await resolvePayableStudent(actor, paymentOrder.studentId);
  if (!student) return forbidden("That payment does not belong to this account.");

  if (paymentOrder.status === "SUCCESS") return invalid("That payment was already confirmed.");
  if (paymentOrder.status !== "CREATED" && paymentOrder.status !== "PENDING") {
    return conflict("That payment attempt is no longer open.");
  }
  if (paymentOrder.gatewayOrderId !== input.razorpayOrderId) {
    return invalid("That confirmation does not match the payment that was started.");
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return { ok: false, status: 500, code: "not_configured", message: "Payments are not configured." };

  const verified = verifyRazorpaySignature({
    orderId: input.razorpayOrderId,
    paymentId: input.razorpayPaymentId,
    signature: input.razorpaySignature,
    secret: keySecret,
  });

  if (!verified) {
    await db.paymentOrder.update({
      where: { id: paymentOrder.id },
      data: { status: "FAILED", failureReason: "Signature verification failed.", gatewayPaymentId: input.razorpayPaymentId },
    });
    return invalid("That payment could not be verified.");
  }

  if (!paymentOrder.invoiceId || !paymentOrder.invoice) {
    return { ok: false, status: 500, code: "no_invoice", message: "That payment has no invoice attached." };
  }

  const paidAt = new Date();
  let receiptId = "";

  try {
    await db.$transaction(async (tx) => {
      const invoice = await tx.feeInvoice.findFirst({ where: { id: paymentOrder.invoiceId! } });
      if (!invoice || invoice.status === "CANCELLED") throw new Error("That invoice is no longer open.");

      const outstanding = outstandingOf(invoice);
      // The gateway is only ever charged what was outstanding at order
      // creation; if the balance moved since (a partial office payment
      // landed in between), collect no more than what's actually still due.
      const received = Math.min(paymentOrder.amount, outstanding);
      if (received <= 0) throw new Error("That invoice has already been paid in full.");

      const payment = await tx.feePayment.create({
        data: {
          schoolId: actor.schoolId,
          studentId: student.id,
          invoiceId: invoice.id,
          amount: received,
          mode: "UPI",
          reference: input.razorpayPaymentId,
          paidAt,
          note: "Paid online via the app (Razorpay).",
        },
      });

      const newPaid = invoice.paidAmount + received;
      await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: { paidAmount: newPaid, status: statusAfterPayment(invoice.amount, newPaid) },
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
            invoiceAmount: invoice.amount,
            lateFee: 0,
            amountPaid: received,
            balanceAfter: invoice.amount - newPaid,
            mode: "UPI",
            reference: input.razorpayPaymentId,
            collectedByName: "Online payment",
            paidAt: paidAt.toISOString(),
          } as never,
        },
      });

      await tx.paymentOrder.update({
        where: { id: paymentOrder.id },
        data: { status: "SUCCESS", settledAt: paidAt, gatewayPaymentId: input.razorpayPaymentId },
      });

      receiptId = receipt.id;
    });
  } catch (e) {
    return { ok: false, status: 409, code: "settle_failed", message: e instanceof Error ? e.message : "Could not record that payment." };
  }

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "fee.payment.collect",
    entity: "Student",
    entityId: student.id,
    summary: `${formatMoney(paymentOrder.amount)} paid online by ${student.name} (${student.admissionNumber}) via Razorpay`,
    after: { amount: paymentOrder.amount, receiptId, razorpayPaymentId: input.razorpayPaymentId },
  });

  return { ok: true, receiptId, amount: paymentOrder.amount };
}
