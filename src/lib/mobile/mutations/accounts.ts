import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import { toRupee } from "@/lib/core/fees-core";
import { formatMoney } from "@/lib/core/money";

/**
 * The mobile-API twin of src/app/app/fees/actions.ts::closeTheDay — the daily
 * cash closeout. Same db writes, same audit trail, just handed an `actor`
 * instead of calling `requireRole()`, and returning a discriminated result
 * instead of `{error}`/`{ok}`. The read side (getDayBook) is a plain query
 * with nothing to authorize beyond the role check, so it is called directly
 * from the route and has no wrapper here.
 */

type Failure = { ok: false; status: number; code: string; message: string };

const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });

export type CloseTheDayInput = { date: string; cashCounted: number; note?: string };
export type CloseTheDayResult = Failure | { ok: true; variance: number; cashExpected: number };

/**
 * Close the day's cash. The variance is recorded, not hidden — that is the
 * whole point of a closeout, and it is what an auditor asks for.
 */
export async function closeTheDayForActor(actor: Actor, input: CloseTheDayInput): Promise<CloseTheDayResult> {
  const day = new Date(input.date);
  if (Number.isNaN(day.getTime())) return invalid("That date is not valid.");
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

  return { ok: true, variance, cashExpected };
}
