import { db } from "@/lib/db";
import { fineFor } from "@/lib/core/library-core";

/** Mirrors src/app/app/library/page.tsx's catalogue search/list. */
export async function getLibraryCatalogue(schoolId: string, q?: string) {
  return db.book.findMany({
    where: {
      schoolId,
      isActive: true,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { author: { contains: q, mode: "insensitive" } },
              { accessionNo: { contains: q, mode: "insensitive" } },
              { isbn: { contains: q.replace(/[\s-]/g, "") } },
            ],
          }
        : {}),
    },
    orderBy: { title: "asc" },
    take: 60,
  });
}

/**
 * Books currently on loan, soonest-due first, with the same projected-fine
 * figure src/app/app/library/page.tsx shows before a book is actually
 * returned (fineFor computed as-of today rather than a real returnedOn).
 */
export async function getOpenIssues(schoolId: string) {
  const today = new Date();
  const openLoans = await db.bookIssue.findMany({
    where: { schoolId, returnedOn: null },
    orderBy: { dueOn: "asc" },
    include: {
      book: { select: { id: true, title: true, accessionNo: true } },
      student: {
        select: { id: true, name: true, class: { select: { name: true } }, section: { select: { name: true } } },
      },
    },
  });

  return openLoans.map((l) => ({
    ...l,
    projectedFine: fineFor(l.dueOn, null, today),
    isOverdue: l.dueOn < today,
  }));
}
