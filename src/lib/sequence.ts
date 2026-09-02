import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Gap-free human-readable numbers (receipts, invoices, TC serials).
 *
 * A school gets audited on receipt continuity, so the counter is incremented
 * inside the caller's transaction and the number is never derived from a count().
 */
export async function nextNumber(
  tx: Prisma.TransactionClient,
  schoolId: string,
  kind: string,
  fallbackPrefix = "",
): Promise<string> {
  const existing = await tx.numberSequence.findUnique({
    where: { schoolId_kind: { schoolId, kind } },
  });

  const seq =
    existing ??
    (await tx.numberSequence.create({
      data: { schoolId, kind, prefix: fallbackPrefix, next: 1 },
    }));

  await tx.numberSequence.update({
    where: { id: seq.id },
    data: { next: seq.next + 1 },
  });

  return `${seq.prefix}${String(seq.next).padStart(seq.width, "0")}`;
}

/** Reads the next number without consuming it — for "your next receipt will be…". */
export async function peekNumber(schoolId: string, kind: string): Promise<string | null> {
  const seq = await db.numberSequence.findUnique({ where: { schoolId_kind: { schoolId, kind } } });
  if (!seq) return null;
  return `${seq.prefix}${String(seq.next).padStart(seq.width, "0")}`;
}

/**
 * A block of consecutive numbers, taken in one write.
 *
 * Raising a term's invoices needs 800-odd numbers at once. Calling nextNumber in a
 * loop would be 800 read-modify-writes on the same row inside one transaction —
 * slow, and every one of them a chance to time out halfway and leave the series
 * with a hole in it. This moves the counter once and hands back the whole run, so
 * the numbers stay consecutive and the invoices stay in step with them.
 */
export async function reserveNumbers(
  tx: Prisma.TransactionClient,
  schoolId: string,
  kind: string,
  count: number,
  fallbackPrefix = "",
): Promise<string[]> {
  if (count <= 0) return [];

  const existing = await tx.numberSequence.findUnique({
    where: { schoolId_kind: { schoolId, kind } },
  });
  const seq =
    existing ??
    (await tx.numberSequence.create({
      data: { schoolId, kind, prefix: fallbackPrefix, next: 1 },
    }));

  await tx.numberSequence.update({
    where: { id: seq.id },
    data: { next: seq.next + count },
  });

  return Array.from(
    { length: count },
    (_, i) => `${seq.prefix}${String(seq.next + i).padStart(seq.width, "0")}`,
  );
}
