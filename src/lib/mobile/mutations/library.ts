import { db } from "@/lib/db";
import { audit, hasRole, type Actor } from "@/lib/session";
import { canIssue, dueDateFor, fineFor, isValidIsbn, LOAN_DAYS } from "@/lib/core/library-core";
import { formatMoney } from "@/lib/core/money";

/**
 * The mobile-API twin of src/app/app/library/actions.ts.
 *
 * Same role gate (OWNER/PRINCIPAL/ADMIN/LIBRARIAN — LIBRARIAN is library-only,
 * which is why this module checks it itself rather than taking the shared
 * OFFICE constant), same rules from library-core (canIssue / fineFor /
 * dueDateFor / isValidIsbn, never re-derived), same db writes, same audit
 * trail — just handed an `actor` and returning a discriminated result instead
 * of the `{error}`/`{ok}` shape a server action's caller expects.
 * revalidatePath is a page-cache concern with nothing to invalidate for a
 * stateless JSON client, so it is dropped here.
 */

export const LIBRARY_ROLES = ["OWNER", "PRINCIPAL", "ADMIN", "LIBRARIAN"] as const;

type Failure = { ok: false; status: number; code: string; message: string };

const notFound = (message: string): Failure => ({ ok: false, status: 404, code: "not_found", message });
const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });
const conflict = (message: string): Failure => ({ ok: false, status: 409, code: "conflict", message });
const forbidden = (message: string): Failure => ({ ok: false, status: 403, code: "forbidden", message });

export type IssueBookInput = { bookId: string; borrowerType: "student" | "staff"; borrowerId: string };
export type IssueBookResult = Failure | { ok: true };

/** Issue a book, refusing with a reason the librarian can say out loud. Mirrors ::issueBook. */
export async function issueBookForActor(actor: Actor, input: IssueBookInput): Promise<IssueBookResult> {
  if (!hasRole(actor, ...LIBRARY_ROLES)) return forbidden("You cannot issue books.");

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

  if (!book) return notFound("That book is not in this library.");
  if (!borrower) return notFound(isStaff ? "That staff member was not found." : "That student is not on the roll.");

  const unpaidFines = openLoans.filter((l) => !l.finePaid).reduce((a, l) => a + l.fineAmount, 0);
  const check = canIssue({
    availableCopies: book.availableCopies,
    openLoans: openLoans.length,
    unpaidFines,
  });
  if (!check.allowed) return conflict(check.reason ?? "Cannot issue this book.");

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

  return { ok: true };
}

export type ReturnBookResult = Failure | { ok: true; fine: number };

/** Take a book back, computing the fine from the shared rule. Mirrors ::returnBook. */
export async function returnBookForActor(actor: Actor, issueId: string): Promise<ReturnBookResult> {
  if (!hasRole(actor, ...LIBRARY_ROLES)) return forbidden("You cannot return books.");

  const issue = await db.bookIssue.findFirst({
    where: { id: issueId, schoolId: actor.schoolId },
    include: { book: true, student: { select: { name: true } }, staff: { select: { user: { select: { name: true } } } } },
  });
  if (!issue) return notFound("That loan no longer exists.");
  if (issue.returnedOn) return conflict("That book has already been returned.");

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

  return { ok: true, fine };
}

export type CollectFineResult = Failure | { ok: true };

/** Mirrors src/app/app/library/actions.ts::collectFine. */
export async function collectFineForActor(actor: Actor, issueId: string): Promise<CollectFineResult> {
  if (!hasRole(actor, ...LIBRARY_ROLES)) return forbidden("You cannot collect fines.");

  const issue = await db.bookIssue.findFirst({
    where: { id: issueId, schoolId: actor.schoolId },
    include: { book: true, student: { select: { name: true } }, staff: { select: { user: { select: { name: true } } } } },
  });
  if (!issue) return notFound("That loan no longer exists.");
  if (issue.finePaid) return conflict("That fine is already cleared.");

  await db.bookIssue.update({ where: { id: issue.id }, data: { finePaid: true } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "library.fine.collect",
    entity: "BookIssue",
    entityId: issue.id,
    summary: `Collected a ${formatMoney(issue.fineAmount)} library fine from ${issue.student?.name ?? issue.staff?.user.name ?? "—"}`,
  });

  return { ok: true };
}

export type AddBookInput = {
  title: string;
  author?: string | null;
  isbn?: string | null;
  category?: string | null;
  publisher?: string | null;
  copies: number;
  shelf?: string | null;
  price?: number | null;
};

export type AddBookResult = Failure | { ok: true; bookId: string; accessionNo: string };

/** Add a title to the catalogue. Mirrors ::addBook. */
export async function addBookForActor(actor: Actor, input: AddBookInput): Promise<AddBookResult> {
  if (!hasRole(actor, ...LIBRARY_ROLES)) return forbidden("You cannot add books.");

  if (!input.title.trim()) return invalid("A book needs a title.");
  const copies = Math.max(1, Math.floor(input.copies || 1));

  // A wrong ISBN is worse than none — it makes the catalogue unsearchable later.
  if (input.isbn?.trim() && !isValidIsbn(input.isbn)) {
    return invalid("That ISBN's check digit does not add up. Re-read it from the book.");
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

  return { ok: true, bookId: book.id, accessionNo };
}
