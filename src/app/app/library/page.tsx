import Link from "next/link";
import { BookOpen, Library, TriangleAlert } from "lucide-react";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { fineFor } from "@/lib/core/library-core";
import { formatMoney } from "@/lib/core/money";
import { Badge, Card, CardHead, Empty, PageHead, Stat } from "@/components/ui/primitives";
import { AddBook, CollectFineButton, IssueBook, ReturnButton } from "./library-desk";

export const metadata = { title: "Library — Flanca" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const actor = await requireActor();
  const sp = await searchParams;
  const today = new Date();

  const [books, openLoans, fineRows, totals] = await Promise.all([
    db.book.findMany({
      where: {
        schoolId: actor.schoolId,
        isActive: true,
        ...(sp.q
          ? {
              OR: [
                { title: { contains: sp.q, mode: "insensitive" } },
                { author: { contains: sp.q, mode: "insensitive" } },
                { accessionNo: { contains: sp.q, mode: "insensitive" } },
                { isbn: { contains: sp.q.replace(/[\s-]/g, "") } },
              ],
            }
          : {}),
      },
      orderBy: { title: "asc" },
      take: 60,
    }),
    db.bookIssue.findMany({
      where: { schoolId: actor.schoolId, returnedOn: null },
      orderBy: { dueOn: "asc" },
      include: {
        book: { select: { title: true } },
        student: {
          select: { id: true, name: true, class: { select: { name: true } }, section: { select: { name: true } } },
        },
        staff: { select: { id: true, designation: true, user: { select: { name: true } } } },
      },
    }),
    db.bookIssue.findMany({
      where: { schoolId: actor.schoolId, fineAmount: { gt: 0 }, finePaid: false },
      include: {
        book: { select: { title: true } },
        student: { select: { id: true, name: true } },
        staff: { select: { id: true, user: { select: { name: true } } } },
      },
      orderBy: { returnedOn: "desc" },
      take: 20,
    }),
    db.book.aggregate({
      where: { schoolId: actor.schoolId, isActive: true },
      _sum: { totalCopies: true, availableCopies: true },
      _count: true,
    }),
  ]);

  const withFines = openLoans.map((l) => ({
    ...l,
    projectedFine: fineFor(l.dueOn, null, today),
    isOverdue: l.dueOn < today,
  }));

  const overdue = withFines.filter((l) => l.isOverdue);

  return (
    <>
      <PageHead
        eyebrow="School"
        title="Library"
        sub="Who has what, what is overdue, and what it costs. Fines are capped and never charged on a book returned on time."
        actions={
          <>
            <IssueBook />
            <AddBook />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Titles"
          value={totals._count}
          sub={`${totals._sum.totalCopies ?? 0} copies in total`}
          icon={<Library className="size-4" />}
        />
        <Stat
          label="On loan"
          value={openLoans.length}
          sub={`${totals._sum.availableCopies ?? 0} copies on the shelf`}
          icon={<BookOpen className="size-4" />}
        />
        <Stat
          label="Overdue"
          value={overdue.length}
          tone={overdue.length > 0 ? "bad" : "good"}
          sub="past the return date"
          icon={<TriangleAlert className="size-4" />}
        />
        <Stat
          label="Fines outstanding"
          value={formatMoney(fineRows.reduce((a, f) => a + f.fineAmount, 0))}
          tone={fineRows.length > 0 ? "warn" : "good"}
          sub={`${fineRows.length} to collect`}
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <CardHead title="Books out" hint="Soonest due first — overdue at the top" />
          {withFines.length === 0 ? (
            <Empty title="Nothing on loan" hint="Every copy is on the shelf." />
          ) : (
            <div className="overflow-x-auto">
              <table className="ruled w-full min-w-[720px]">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Borrower</th>
                    <th>Class / role</th>
                    <th>Due</th>
                    <th className="num">Fine so far</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {withFines.map((l) => (
                    <tr key={l.id} className={l.isOverdue ? "bg-overdue-light/40" : undefined}>
                      <td data-title className="max-w-[220px] truncate font-medium">{l.book.title}</td>
                      <td data-label="Borrower">
                        {l.student ? (
                          <Link
                            href={`/app/students/${l.student.id}`}
                            className="hover:text-brand hover:underline"
                          >
                            {l.student.name}
                          </Link>
                        ) : l.staff ? (
                          <Link href={`/app/staff/${l.staff.id}`} className="hover:text-brand hover:underline">
                            {l.staff.user.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-label="Class / role" className="whitespace-nowrap text-ink-2">
                        {l.student ? (
                          <>
                            {l.student.class?.name ?? "—"}
                            {l.student.section ? ` ${l.student.section.name}` : ""}
                          </>
                        ) : l.staff ? (
                          <Badge tone="neutral">{l.staff.designation ?? "Staff"}</Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-label="Due" className={`whitespace-nowrap ${l.isOverdue ? "font-medium text-overdue" : "text-ink-2"}`}>
                        {l.dueOn.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}
                      </td>
                      <td data-label="Fine so far" className="num">
                        {l.projectedFine > 0 ? (
                          <span className="font-semibold text-overdue">{formatMoney(l.projectedFine)}</span>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                      <td data-label="">
                        <ReturnButton issueId={l.id} fine={l.projectedFine} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHead title="Fines to collect" hint="Returned late, not yet paid" />
            {fineRows.length === 0 ? (
              <Empty title="No fines outstanding" />
            ) : (
              <ul className="divide-y divide-line">
                {fineRows.map((f) => (
                  <li key={f.id} className="px-5 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium">{f.student?.name ?? f.staff?.user.name ?? "—"}</p>
                        <p className="truncate text-[11.5px] text-ink-3">{f.book.title}</p>
                      </div>
                      <Badge tone="warn">{formatMoney(f.fineAmount)}</Badge>
                    </div>
                    <div className="mt-1.5">
                      <CollectFineButton issueId={f.id} fine={f.fineAmount} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHead title="Catalogue" hint={`${totals._count} titles`} />
            <form method="get" className="border-b border-line px-5 py-3">
              <input
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Search title, author, ISBN or accession"
                className="h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
              />
            </form>
            {books.length === 0 ? (
              <Empty title="No books match" />
            ) : (
              <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
                {books.map((b) => (
                  <li key={b.id} className="px-5 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium">{b.title}</p>
                        <p className="truncate text-[11.5px] text-ink-3">
                          {b.author ?? "—"}
                          {b.shelf ? ` · shelf ${b.shelf}` : ""}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-[12px] font-semibold tnum ${
                          b.availableCopies === 0 ? "text-overdue" : "text-good"
                        }`}
                      >
                        {b.availableCopies}/{b.totalCopies}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
