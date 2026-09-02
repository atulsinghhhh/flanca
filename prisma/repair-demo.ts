/**
 * One-off repairs to the demo school's data.
 *
 * Two things had drifted into a state a real school could not be in, both of them
 * the kind of thing somebody notices in the first minute of a demo:
 *
 * 1. **Books returned in the future.** The seed picked a return date up to 22 days
 *    after the issue date without clamping it to today, so about one issue in seven
 *    came back next week. Fixed at the source in seed-academics.ts; this brings the
 *    existing rows into line — a return date that cannot exist becomes either a
 *    plausible past date or, when the book went out too recently to have come back,
 *    a book that is still out (and its copy count goes back down to match).
 *
 * 2. **Twenty-two holes in the receipt series.** 1,396 receipts numbered across a
 *    range of 1,418: an earlier session's test payments were deleted, and deleting a
 *    payment takes its receipt with it. The seed cannot produce a gap on its own.
 *    Gap-free receipt numbering is not a nice-to-have here — it is the thing a
 *    school gets audited on, and the product claims it. Receipts are renumbered in
 *    the order they were issued and the counter is set to follow them. The frozen
 *    snapshot on each receipt holds amounts, not the number, so a reprint still
 *    shows exactly what the parent was handed.
 *
 * Run with: pnpm tsx prisma/repair-demo.ts
 */
import { PrismaClient } from "@prisma/client";
import { buildTimetable, countClashes } from "../src/lib/core/timetable-core";

const db = new PrismaClient();
const DAY = 86_400_000;

async function main() {
  const school = await db.school.findFirst({ select: { id: true, name: true } });
  if (!school) throw new Error("No school to repair.");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // ── 1. books returned in the future ──────────────────────────────────────────
  const impossible = await db.bookIssue.findMany({
    where: { schoolId: school.id, returnedOn: { gt: today } },
    select: { id: true, bookId: true, issuedOn: true, dueOn: true },
  });

  let stillOut = 0;
  let redated = 0;
  for (const issue of impossible) {
    const earliest = issue.issuedOn.getTime() + 3 * DAY;
    if (earliest > today.getTime()) {
      // Too recent to have come back at all — the book is out.
      await db.bookIssue.update({
        where: { id: issue.id },
        data: { returnedOn: null, fineAmount: 0, finePaid: false },
      });
      await db.book.update({ where: { id: issue.bookId }, data: { availableCopies: { decrement: 1 } } });
      stillOut += 1;
      continue;
    }
    const span = today.getTime() - earliest;
    const returnedOn = new Date(earliest + Math.round(Math.random() * span));
    const overdueDays = Math.max(0, Math.round((returnedOn.getTime() - issue.dueOn.getTime()) / DAY));
    await db.bookIssue.update({
      where: { id: issue.id },
      data: {
        returnedOn,
        fineAmount: overdueDays > 0 ? overdueDays * 200 : 0,
        finePaid: overdueDays > 0,
      },
    });
    redated += 1;
  }
  console.log(`books: ${redated} return dates brought back into the past, ${stillOut} still out`);

  // ── 2. gap-free receipt numbers ──────────────────────────────────────────────
  const receipts = await db.receipt.findMany({
    where: { schoolId: school.id },
    orderBy: [{ issuedAt: "asc" }, { receiptNumber: "asc" }],
    select: { id: true, receiptNumber: true },
  });

  const prefix = "RCP/26-27/";
  const wanted = receipts.map((r, i) => ({ id: r.id, from: r.receiptNumber, to: `${prefix}${String(i + 1).padStart(5, "0")}` }));
  const moving = wanted.filter((w) => w.from !== w.to);

  if (moving.length > 0) {
    // Two passes through a parking prefix: [schoolId, receiptNumber] is unique, and
    // renumbering in place would collide with a number the run has not reached yet.
    await db.$transaction(
      moving.map((w) => db.receipt.update({ where: { id: w.id }, data: { receiptNumber: `TMP/${w.id.slice(0, 8)}` } })),
    );
    await db.$transaction(
      moving.map((w) => db.receipt.update({ where: { id: w.id }, data: { receiptNumber: w.to } })),
    );
  }

  await db.numberSequence.update({
    where: { schoolId_kind: { schoolId: school.id, kind: "RECEIPT" } },
    data: { next: receipts.length + 1, prefix, width: 5 },
  });
  console.log(`receipts: ${moving.length} renumbered, series is now 1–${receipts.length}, counter at ${receipts.length + 1}`);

  // ── 3. copies on the shelf ───────────────────────────────────────────────────
  // availableCopies is a running counter kept by hand — decremented on issue,
  // incremented on return — so any correction above leaves it out of step, and one
  // book went to minus one. The truth is countable: total copies less the ones
  // actually out. Recomputed for every book rather than patched for the one that
  // showed, because a counter that has drifted once has no reason to be right
  // anywhere else.
  const books = await db.book.findMany({
    where: { schoolId: school.id },
    select: { id: true, title: true, totalCopies: true, availableCopies: true, issues: { where: { returnedOn: null }, select: { id: true } } },
  });
  // One book had six copies out of four. canIssue refuses to lend a book with
  // nothing on the shelf, so the app cannot get here — the seed lent copies it had
  // not counted. The library plainly owns at least as many copies as are out on
  // loan, so the total comes up to meet the loans rather than the loan history
  // being rewritten to fit a number.
  const wrong = books.filter(
    (b) => b.availableCopies !== b.totalCopies - b.issues.length || b.totalCopies < b.issues.length,
  );
  await db.$transaction(
    wrong.map((b) => {
      const total = Math.max(b.totalCopies, b.issues.length);
      return db.book.update({
        where: { id: b.id },
        data: { totalCopies: total, availableCopies: total - b.issues.length },
      });
    }),
  );
  const restocked = books.filter((b) => b.totalCopies < b.issues.length);
  console.log(
    `shelf: ${wrong.length} of ${books.length} books had a stale copy count` +
      (restocked.length > 0 ? `, ${restocked.length} had more copies out than it owned` : ""),
  );
  // ── 4. the timetable ─────────────────────────────────────────────────────────
  // Two faults, one after the other. staffId was filled by a round-robin over the
  // staff list that had nothing to do with who teaches the subject, so 986 of 1,012
  // periods were taken by somebody not assigned to them. Making the teacher follow
  // the subject then left 508 periods with one teacher wanted in two classrooms at
  // once, because each subject has one teacher and the same slot comes up in several
  // classes. Only scheduling fixes that, so the whole week is rebuilt with
  // buildTimetable — the same function the seed now uses — keeping each section's
  // existing shape of days and periods.
  const links = await db.staffSubject.findMany({ select: { staffId: true, subjectId: true } });
  const teacherOf = new Map(links.map((l) => [l.subjectId, l.staffId] as const));

  // sectionId and classId are nullable on TimetableEntry; a period belonging to no
  // section cannot be scheduled against anybody, so it is left exactly as it is.
  const existing = (
    await db.timetableEntry.findMany({
      where: { schoolId: school.id },
      select: { id: true, sectionId: true, classId: true, dayOfWeek: true, period: true, staffId: true, subjectId: true },
    })
  )
    .filter((e) => e.sectionId && e.classId)
    .map((e) => ({ ...e, sectionId: e.sectionId!, classId: e.classId! }));

  const subjectsByClass = new Map<string, { subjectId: string; staffId: string | null }[]>();
  for (const s of await db.subject.findMany({
    where: { schoolId: school.id, isCoScholastic: false },
    select: { id: true, classId: true },
  })) {
    if (!s.classId) continue;
    const at = subjectsByClass.get(s.classId) ?? [];
    at.push({ subjectId: s.id, staffId: teacherOf.get(s.id) ?? null });
    subjectsByClass.set(s.classId, at);
  }

  const classOfSection = new Map(existing.map((e) => [e.sectionId, e.classId] as const));
  const built = buildTimetable({
    slots: existing.map((e) => ({ sectionId: e.sectionId, dayOfWeek: e.dayOfWeek, period: e.period })),
    sections: [...new Set(existing.map((e) => e.sectionId))].map((sectionId) => ({
      sectionId,
      subjects: subjectsByClass.get(classOfSection.get(sectionId) ?? "") ?? [],
    })),
  });

  const rowAt = new Map(existing.map((e) => [`${e.sectionId}|${e.dayOfWeek}|${e.period}`, e] as const));

  // Only touch the timetable if it is actually wrong. Rewriting a correct week would
  // move rooms and teachers for no reason and report work that did not need doing.
  const misassigned = existing.filter((e) => {
    const should = e.subjectId ? teacherOf.get(e.subjectId) : undefined;
    return should && should !== e.staffId;
  }).length;
  const clashesNow = countClashes(
    existing.map((e) => ({ ...e, subjectId: e.subjectId ?? "", staffId: e.staffId })),
  );

  if (misassigned === 0 && clashesNow === 0) {
    console.log(`timetable: ${existing.length} periods, already consistent — nothing to do`);
  } else {
    for (let i = 0; i < built.entries.length; i += 200) {
      await db.$transaction(
        built.entries.slice(i, i + 200).map((e) => {
          const row = rowAt.get(`${e.sectionId}|${e.dayOfWeek}|${e.period}`)!;
          return db.timetableEntry.update({
            where: { id: row.id },
            data: { subjectId: e.subjectId, staffId: e.staffId },
          });
        }),
      );
    }

    // A period the scheduler could not fill without putting somebody in two rooms is
    // removed, not left pointing at a teacher who is elsewhere. A free period is an
    // honest thing for a timetable to contain.
    const placedKeys = new Set(built.entries.map((e) => `${e.sectionId}|${e.dayOfWeek}|${e.period}`));
    const orphaned = existing.filter((e) => !placedKeys.has(`${e.sectionId}|${e.dayOfWeek}|${e.period}`));
    if (orphaned.length > 0) {
      await db.timetableEntry.deleteMany({ where: { id: { in: orphaned.map((o) => o.id) } } });
    }

    console.log(
      `timetable: ${misassigned} periods had the wrong teacher and ${clashesNow} were double-booked; ` +
        `${built.entries.length} rebuilt, busiest week ${built.busiestTeacherPeriods} periods` +
        (orphaned.length > 0 ? `, ${orphaned.length} left free` : ""),
    );
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());