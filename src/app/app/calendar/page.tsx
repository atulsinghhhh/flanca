import Link from "next/link";
import { Globe } from "lucide-react";
import { db } from "@/lib/db";
import { isoDay } from "@/lib/queries/when";
import { requireActor, hasRole, OFFICE } from "@/lib/session";
import { isNonTeachingDay } from "@/lib/queries/attendance";
import { Badge, Card, CardHead, Empty, PageHead } from "@/components/ui/primitives";
import { AddEvent } from "./add-event";
import { DeleteEvent } from "./delete-event";

export const metadata = { title: "Calendar — Flanca" };

const KIND_TONE: Record<string, "bad" | "warn" | "info" | "brand" | "neutral"> = {
  HOLIDAY: "bad",
  EXAM: "warn",
  PTM: "info",
  EVENT: "brand",
  ACTIVITY: "neutral",
};

// "PTM" is an acronym; naive title-casing renders it "Ptm".
const KIND_LABEL: Record<string, string> = {
  HOLIDAY: "Holiday",
  EXAM: "Exam",
  PTM: "PTM",
  EVENT: "Event",
  ACTIVITY: "Activity",
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const actor = await requireActor();
  const office = hasRole(actor, ...OFFICE);
  const sp = await searchParams;

  const now = new Date();
  const [yearStr, monthStr] = (
    sp.month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  ).split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;

  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));

  const [events, upcoming] = await Promise.all([
    db.calendarEvent.findMany({
      where: {
        schoolId: actor.schoolId,
        startDate: { lte: last },
        OR: [{ endDate: null, startDate: { gte: first } }, { endDate: { gte: first } }],
      },
      orderBy: { startDate: "asc" },
    }),
    db.calendarEvent.findMany({
      where: { schoolId: actor.schoolId, startDate: { gte: new Date() } },
      orderBy: { startDate: "asc" },
      take: 8,
    }),
  ]);

  // Build the month grid, Monday-first as Indian school calendars are printed.
  const leading = (first.getUTCDay() + 6) % 7;
  const cells: Array<{ day: number | null; date: Date | null }> = [];
  for (let i = 0; i < leading; i++) cells.push({ day: null, date: null });
  for (let d = 1; d <= last.getUTCDate(); d++) {
    cells.push({ day: d, date: new Date(Date.UTC(year, month, d)) });
  }

  const eventsOn = (date: Date) =>
    events.filter((e) => {
      const start = new Date(Date.UTC(e.startDate.getUTCFullYear(), e.startDate.getUTCMonth(), e.startDate.getUTCDate()));
      const end = e.endDate
        ? new Date(Date.UTC(e.endDate.getUTCFullYear(), e.endDate.getUTCMonth(), e.endDate.getUTCDate()))
        : start;
      return date >= start && date <= end;
    });

  const prev = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month + 1, 1));
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  return (
    <>
      <PageHead
        eyebrow="Today"
        title="School calendar"
        sub="Holidays added here are excluded from attendance automatically, and anything marked public shows on the school's own page."
        actions={<AddEvent today={isoDay()} />}
      />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_300px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <Link
              href={`/app/calendar?month=${fmt(prev)}`}
              className="rounded-md border border-line-2 bg-white px-2.5 py-1.5 text-[13px] font-semibold hover:bg-paper-2"
            >
              ←
            </Link>
            <h2 className="font-display text-[16px] font-semibold">
              {first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
            </h2>
            <Link
              href={`/app/calendar?month=${fmt(next)}`}
              className="rounded-md border border-line-2 bg-white px-2.5 py-1.5 text-[13px] font-semibold hover:bg-paper-2"
            >
              →
            </Link>
          </div>

          <div className="grid grid-cols-7 border-b border-line bg-paper-2/60">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-2 py-1.5 text-center text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              if (!cell.date) return <div key={`pad-${i}`} className="min-h-[86px] border-r border-b border-line bg-paper-2/40" />;

              const dayEvents = eventsOn(cell.date);
              const nonTeaching = isNonTeachingDay(cell.date);
              const isToday = isoDay(cell.date) === isoDay();

              return (
                <div
                  key={cell.day}
                  className={`min-h-[86px] border-r border-b border-line p-1.5 ${
                    nonTeaching ? "bg-paper-2/50" : "bg-white"
                  }`}
                >
                  <p
                    className={`mb-1 text-[12px] tnum ${
                      isToday
                        ? "inline-flex size-5 items-center justify-center rounded-full bg-brand font-bold text-white"
                        : nonTeaching
                          ? "text-ink-3"
                          : "text-ink-2"
                    }`}
                  >
                    {cell.day}
                  </p>
                  <ul className="space-y-0.5">
                    {dayEvents.slice(0, 2).map((e) => (
                      <li
                        key={e.id}
                        title={e.title}
                        className={`truncate rounded px-1 py-0.5 text-[10.5px] font-medium ${
                          e.kind === "HOLIDAY"
                            ? "bg-overdue-light text-overdue"
                            : e.kind === "EXAM"
                              ? "bg-marigold-light text-marigold-ink"
                              : e.kind === "PTM"
                                ? "bg-info-light text-info"
                                : "bg-brand-light text-brand-ink"
                        }`}
                      >
                        {e.title}
                      </li>
                    ))}
                    {dayEvents.length > 2 ? (
                      <li className="px-1 text-[10px] text-ink-3">+{dayEvents.length - 2} more</li>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHead title="Coming up" hint="The next eight dates" />
          {upcoming.length === 0 ? (
            <Empty title="Nothing scheduled" />
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="mt-0.5 w-11 shrink-0 rounded-md border border-line bg-paper-2 py-1 text-center">
                    <p className="text-[10px] font-semibold tracking-wide text-ink-3 uppercase">
                      {e.startDate.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}
                    </p>
                    <p className="tnum text-[15px] font-semibold leading-tight">{e.startDate.getUTCDate()}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium leading-snug">{e.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
                      <Badge tone={KIND_TONE[e.kind] ?? "neutral"}>
                        {KIND_LABEL[e.kind] ?? e.kind}
                      </Badge>
                      {e.isPublic ? <Globe className="size-3" /> : null}
                      {e.endDate
                        ? `until ${e.endDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}`
                        : null}
                    </p>
                  </div>
                  {office ? <DeleteEvent eventId={e.id} title={e.title} /> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
