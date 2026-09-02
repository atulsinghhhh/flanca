"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, MONEY } from "@/lib/session";
import { reserveNumbers } from "@/lib/sequence";
import { formatMoney } from "@/lib/core/money";
import { planTermBilling } from "@/lib/core/fees-core";
import { gatherTermBilling } from "@/lib/queries/fees";
import { schoolToday } from "@/lib/queries/when";

/**
 * Raise a term's invoices.
 *
 * The single most consequential button in the product: it puts a demand in front
 * of every family in the school. The demo school has shipped with Terms 3 and 4
 * unraised since the first seed — not as a scenario, but because there was no way
 * to raise them.
 *
 * Four properties it has to have:
 *
 * 1. **Idempotent.** A student already invoiced for this term is skipped, so a
 *    second click, a double submit or a refresh cannot double-bill a family.
 * 2. **The preview is the same arithmetic.** The screen's total comes from
 *    gatherTermBilling + planTermBilling, and so does this; there is no second
 *    estimate free to drift from what is written.
 * 3. **One transaction.** Either the term is raised or it is not. A half-raised
 *    term is a school where some parents owe money and others do not, with no way
 *    to tell which from the outside.
 * 4. **Gap-free numbers.** The whole block of invoice numbers is reserved in one
 *    write, so the series a school gets audited on stays consecutive.
 */
export async function raiseTermInvoices(input: { label: string; expectedCount: number }) {
  const actor = await requireRole(...MONEY);

  const gathered = await gatherTermBilling(actor.schoolId, input.label);
  if (!gathered) return { error: "There is no current academic year, so there is no term to raise." };
  if (gathered.termCount === 0) return { error: "This year has no terms set up yet." };
  if (!gathered.termLabels.includes(input.label)) return { error: `No class has a term called ${input.label}.` };

  const plan = planTermBilling({ candidates: gathered.candidates, share: gathered.share });
  if (plan.toRaise.length === 0) {
    return { error: `Every eligible student already has an invoice for ${input.label}. Nothing to raise.` };
  }

  // The count the school was shown when it decided. If the roll changed between
  // the preview and the click — a child admitted, a concession approved — it says
  // so and asks again rather than billing a number nobody agreed to.
  if (input.expectedCount !== plan.toRaise.length) {
    return {
      error: `This would now raise ${plan.toRaise.length} invoices, not ${input.expectedCount}. Something changed — check the list and try again.`,
    };
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

  revalidatePath("/app/fees");
  revalidatePath("/app/fees/raise");
  revalidatePath("/app/fees/structures");
  return { ok: true as const, raised: plan.toRaise.length, net: plan.net };
}
