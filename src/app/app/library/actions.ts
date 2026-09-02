"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireActor, hasRole } from "@/lib/session";
import { canIssue, dueDateFor, fineFor, isValidIsbn, LOAN_DAYS } from "@/lib/core/library-core";
import { formatMoney } from "@/lib/core/money";

const LIBRARY_ROLES = ["OWNER", "PRINCIPAL", "ADMIN", "LIBRARIAN"] as const;

/** Issue a book, refusing with a reason the librarian can say out loud. */
export async function issueBook(input: { bookId: string; borrowerType: "student" | "staff"; borrowerId: string }) {
  const actor = await requireActor();
  if (!hasRole(actor, ...LIBRARY_ROLES)) return { error: "You cannot issue books." };

  const isStaff = input.borrowerType === "staff";

  const [book, openLoans] = await Promise.all([
    db.book.findFirst({ where: { id: input.bookId, schoolId: actor.schoolId } }),
    db.bookIssue.findMany({
      where: {
        schoolId: actor.schoolId,
        returnedOn: null,
        ...(isStaff ? { staffId: input.borrowerId } : { studentId: input.borrowerId }),
      },
      select: { fineAmount: true, finePaid: true },
    }),
  ]);

  const borrower = isStaff
    ? await db.staff
        .findFirst({
          where: { id: input.borrowerId, schoolId: actor.schoolId, isActive: true },
          select: { id: true, user: { select: { name: true } } },
        })
        .then((s) => (s ? { id: s.id, name: s.user.name } : null))
    : await db.student.findFirst({
        where: { id: input.borrowerId, schoolId: actor.schoolId, status: "ACTIVE" },
        select: { id: true, name: true },
      });

  if (!book) return { error: "That book is not in this library." };
  if (!borrower) return { error: isStaff ? "That staff member was not found." : "That student is not on the roll." };

  const unpaidFines = openLoans.filter((l) => !l.finePaid).reduce((a, l) => a + l.fineAmount, 0);
  const check = canIssue({
    availableCopies: book.availableCopies,
    openLoans: openLoans.length,
    unpaidFines,
  });
  if (!check.allowed) return { error: check.reason ?? "Cannot issue this book." };

  const now = new Date();
  const issuedOn = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  await db.$transaction(async (tx) => {
    await tx.bookIssue.create({
      data: {
        schoolId: actor.schoolId,
        bookId: book.id,
        studentId: isStaff ? null : borrower.id,
        staffId: isStaff ? borrower.id : null,
        issuedOn,
        dueOn: dueDateFor(issuedOn),
      },
    });
    await tx.book.update({
      where: { id: book.id },
      data: { availableCopies: { decrement: 1 } },
    });
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "library.issue",
    entity: "Book",
    entityId: book.id,
    summary: `Issued "${book.title}" to ${borrower.name}, due in ${LOAN_DAYS} days`,
  });

  revalidatePath("/app/library");
  return { ok: true };
}

/** Up to 8 books with a copy on the shelf, for the issue-book search box. */
export async function searchBooksForIssue(query: string) {
  const actor = await requireActor();
  if (!hasRole(actor, ...LIBRARY_ROLES)) return [];
  if (!query.trim()) return [];

  return db.book.findMany({
    where: {
      schoolId: actor.schoolId,
      isActive: true,
      availableCopies: { gt: 0 },
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { author: { contains: query, mode: "insensitive" } },
        { accessionNo: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true, title: true, author: true, accessionNo: true, availableCopies: true },
    orderBy: { title: "asc" },
    take: 8,
  });
}

/** Up to 8 students or staff matching a name, for the issue-book search box. */
export async function searchBorrowers(kind: "student" | "staff", query: string) {
  const actor = await requireActor();
  if (!hasRole(actor, ...LIBRARY_ROLES)) return [];
  if (!query.trim()) return [];

  if (kind === "staff") {
    const staff = await db.staff.findMany({
      where: { schoolId: actor.schoolId, isActive: true, user: { name: { contains: query, mode: "insensitive" } } },
      select: { id: true, designation: true, user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
      take: 8,
    });
    return staff.map((s) => ({ id: s.id, name: s.user.name, sub: s.designation ?? "Staff" }));
  }

  const students = await db.student.findMany({
    where: { schoolId: actor.schoolId, status: "ACTIVE", name: { contains: query, mode: "insensitive" } },
    select: { id: true, name: true, class: { select: { name: true } }, section: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: 8,
  });
  return students.map((s) => ({
    id: s.id,
    name: s.name,
    sub: `${s.class?.name ?? "—"}${s.section ? ` ${s.section.name}` : ""}`,
  }));
}

/** Take a book back, computing the fine from the shared rule. */
export async function returnBook(issueId: string) {
  const actor = await requireActor();
  if (!hasRole(actor, ...LIBRARY_ROLES)) return { error: "You cannot return books." };

  const issue = await db.bookIssue.findFirst({
    where: { id: issueId, schoolId: actor.schoolId },
    include: { book: true, student: { select: { name: true } }, staff: { select: { user: { select: { name: true } } } } },
  });
  if (!issue) return { error: "That loan no longer exists." };
  if (issue.returnedOn) return { error: "That book has already been returned." };

  const now = new Date();
  const returnedOn = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const fine = fineFor(issue.dueOn, returnedOn, returnedOn);

  await db.$transaction(async (tx) => {
    await tx.bookIssue.update({
      where: { id: issue.id },
      data: { returnedOn, fineAmount: fine, finePaid: fine === 0 },
    });
    await tx.book.update({
      where: { id: issue.bookId },
      data: { availableCopies: { increment: 1 } },
    });
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "library.return",
    entity: "Book",
    entityId: issue.bookId,
    summary: `"${issue.book.title}" returned by ${issue.student?.name ?? issue.staff?.user.name ?? "—"}${fine > 0 ? ` with a ${formatMoney(fine)} fine` : " on time"}`,
  });

  revalidatePath("/app/library");
  return { ok: true, fine };
}

export async function collectFine(issueId: string) {
  const actor = await requireActor();
  if (!hasRole(actor, ...LIBRARY_ROLES)) return { error: "You cannot collect fines." };

  const issue = await db.bookIssue.findFirst({
    where: { id: issueId, schoolId: actor.schoolId },
    include: { book: true, student: { select: { name: true } }, staff: { select: { user: { select: { name: true } } } } },
  });
  if (!issue) return { error: "That loan no longer exists." };
  if (issue.finePaid) return { error: "That fine is already cleared." };

  await db.bookIssue.update({ where: { id: issue.id }, data: { finePaid: true } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "library.fine.collect",
    entity: "BookIssue",
    entityId: issue.id,
    summary: `Collected a ${formatMoney(issue.fineAmount)} library fine from ${issue.student?.name ?? issue.staff?.user.name ?? "—"}`,
  });

  revalidatePath("/app/library");
  return { ok: true };
}

/** Add a title to the catalogue. */
export async function addBook(input: {
  title: string;
  author?: string;
  isbn?: string;
  category?: string;
  publisher?: string;
  copies: number;
  shelf?: string;
  price?: number;
}) {
  const actor = await requireActor();
  if (!hasRole(actor, ...LIBRARY_ROLES)) return { error: "You cannot add books." };

  if (!input.title.trim()) return { error: "A book needs a title." };
  const copies = Math.max(1, Math.floor(input.copies || 1));

  // A wrong ISBN is worse than none — it makes the catalogue unsearchable later.
  if (input.isbn?.trim() && !isValidIsbn(input.isbn)) {
    return { error: "That ISBN's check digit does not add up. Re-read it from the book." };
  }

  const last = await db.book.findFirst({
    where: { schoolId: actor.schoolId },
    orderBy: { accessionNo: "desc" },
    select: { accessionNo: true },
  });
  const lastNumber = Number(last?.accessionNo?.split("-").pop() ?? 1000);
  const accessionNo = `NPS-L-${Number.isFinite(lastNumber) ? lastNumber + 1 : 1001}`;

  const book = await db.book.create({
    data: {
      schoolId: actor.schoolId,
      accessionNo,
      title: input.title.trim(),
      author: input.author?.trim() || null,
      isbn: input.isbn?.replace(/[\s-]/g, "") || null,
      category: input.category?.trim() || null,
      publisher: input.publisher?.trim() || null,
      shelf: input.shelf?.trim() || null,
      price: input.price ? Math.round(input.price * 100) : null,
      totalCopies: copies,
      availableCopies: copies,
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "library.book.add",
    entity: "Book",
    entityId: book.id,
    summary: `Added "${book.title}" (${copies} cop${copies === 1 ? "y" : "ies"}) as ${accessionNo}`,
  });

  revalidatePath("/app/library");
  return { ok: true, accessionNo };
}
