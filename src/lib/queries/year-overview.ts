import { db } from "@/lib/db";

export type YearOverviewItem = {
  date: string;
  endDate: string | null;
  title: string;
  kind: string;
  detail: string | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Everything already on the books for one academic year, in one chronological
 * list — exam terms (which carry a real academicYearId FK), PTM days (which
 * don't: PTMSlot has no year FK at all, so it's range-filtered against the
 * year's own start/end dates instead), and whatever office has typed onto the
 * calendar (holidays, events, activities). Nothing here is a new source of
 * truth; it folds three models that were never joined before this existed.
 */
export async function getAcademicYearOverview(schoolId: string, yearId: string) {
  const year = await db.academicYear.findFirst({ where: { id: yearId, schoolId } });
  if (!year) return null;

  const [examTerms, ptmSlots, calendarEvents] = await Promise.all([
    db.examTerm.findMany({
      where: { schoolId, academicYearId: yearId },
      select: { id: true, name: true, startDate: true, endDate: true, isPublished: true },
      orderBy: { sequenceOrder: "asc" },
    }),
    db.pTMSlot.findMany({
      where: { schoolId, date: { gte: year.startDate, lte: year.endDate } },
      select: { date: true, section: { select: { name: true, class: { select: { name: true } } } } },
    }),
    db.calendarEvent.findMany({
      where: { schoolId, startDate: { gte: year.startDate, lte: year.endDate } },
      select: { title: true, details: true, startDate: true, endDate: true, kind: true },
    }),
  ]);

  // One row per PTM day, not one per slot — a section list of "PTM, PTM, PTM"
  // forty times over for one afternoon of five-minute slots would swamp every
  // real event on the year's timeline.
  const ptmByDate = new Map<string, Set<string>>();
  for (const s of ptmSlots) {
    const d = iso(s.date);
    const label = s.section ? `${s.section.class?.name ?? ""} ${s.section.name}`.trim() : "";
    const set = ptmByDate.get(d) ?? new Set<string>();
    if (label) set.add(label);
    ptmByDate.set(d, set);
  }

  const items: YearOverviewItem[] = [];

  // ExamTerm is per-class (schema: classId), so "Unit Test 1" exists as one
  // row per class sharing the same name/dates — 15+ identical-looking rows
  // for one real event on the calendar. Fold them back into the one event a
  // school actually thinks of, same as the PTM-by-day grouping above.
  const examByKey = new Map<string, { startDate: string; endDate: string | null; classes: number; published: number }>();
  for (const t of examTerms) {
    if (!t.startDate) continue;
    const key = `${t.name}|${iso(t.startDate)}|${t.endDate ? iso(t.endDate) : ""}`;
    const at = examByKey.get(key) ?? { startDate: iso(t.startDate), endDate: t.endDate ? iso(t.endDate) : null, classes: 0, published: 0 };
    at.classes += 1;
    if (t.isPublished) at.published += 1;
    examByKey.set(key, at);
  }
  for (const [key, at] of examByKey) {
    const name = key.split("|")[0];
    items.push({
      date: at.startDate,
      endDate: at.endDate,
      title: name,
      kind: "EXAM_TERM",
      detail: at.published === 0 ? null : at.published === at.classes ? "Results published" : `Results published for ${at.published}/${at.classes} classes`,
    });
  }

  for (const [date, sections] of ptmByDate) {
    items.push({
      date,
      endDate: null,
      title: "Parent-teacher meeting",
      kind: "PTM",
      detail: sections.size > 0 ? [...sections].join(", ") : null,
    });
  }

  for (const e of calendarEvents) {
    items.push({
      date: iso(e.startDate),
      endDate: e.endDate ? iso(e.endDate) : null,
      title: e.title,
      kind: e.kind,
      detail: e.details,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date));

  return {
    year: {
      id: year.id,
      name: year.name,
      startDate: iso(year.startDate),
      endDate: iso(year.endDate),
      isCurrent: year.isCurrent,
    },
    items,
  };
}
