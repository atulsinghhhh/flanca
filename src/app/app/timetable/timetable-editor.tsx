"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { generateWeek, setPeriod } from "./actions";

export type Cell = {
  dayOfWeek: number;
  period: number;
  subjectId: string | null;
  subjectName: string | null;
  staffId: string | null;
  staffName: string | null;
  roomNo: string | null;
  meetingUrl: string | null;
};

export type SubjectOption = { id: string; name: string; teacherStaffIds: string[] };
export type TeacherOption = { staffId: string; name: string; periods: number };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SELECT = "h-8.5 w-full rounded-md border border-line-2 bg-white px-2 text-[13px] outline-none focus:border-brand";

/**
 * The week, editable a period at a time.
 *
 * Teachers who are already teaching somewhere else at that hour are shown as busy
 * *in the list*, with the section they are in, rather than being offered and then
 * refused. The server checks the same thing again — this is a courtesy, not the
 * guarantee.
 */
export function TimetableEditor({
  sectionId,
  sectionLabel,
  periods,
  cells,
  subjects,
  teachers,
  busyElsewhere,
}: {
  sectionId: string;
  sectionLabel: string;
  periods: number[];
  cells: Cell[];
  subjects: SubjectOption[];
  teachers: TeacherOption[];
  /** "day|period" → [{ staffId, where }] */
  busyElsewhere: Record<string, { staffId: string; where: string }[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subjectId: string; staffId: string; roomNo: string; meetingUrl: string }>({
    subjectId: "",
    staffId: "",
    roomNo: "",
    meetingUrl: "",
  });
  const [asking, setAsking] = useState(false);

  const at = (day: number, period: number) => cells.find((c) => c.dayOfWeek === day && c.period === period);
  const key = (day: number, period: number) => `${day}|${period}`;

  function run(fn: () => Promise<{ error?: string } | undefined>, after?: () => void) {
    setError(null);
    start(async () => {
      const r = (await fn()) ?? {};
      if (r.error) {
        setError(r.error);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  function open(day: number, period: number) {
    const cell = at(day, period);
    setError(null);
    setEditing(key(day, period));
    setDraft({
      subjectId: cell?.subjectId ?? "",
      staffId: cell?.staffId ?? "",
      roomNo: cell?.roomNo ?? "",
      meetingUrl: cell?.meetingUrl ?? "",
    });
  }

  const busyFor = (day: number, period: number) => busyElsewhere[key(day, period)] ?? [];

  return (
    <>
      {error ? (
        <p className="mx-5 mt-4 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13.5px] text-overdue">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        {asking ? (
          <div className="w-full rounded-lg border border-marigold/35 bg-marigold-light/60 px-4 py-3">
            <p className="text-[13.5px] font-semibold">Rebuild the whole week for {sectionLabel}?</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
              Every period for this section is replaced. It schedules around the rest of the school, so no
              teacher ends up in two rooms — and any period it cannot fill without a clash is left free
              rather than double-booked.
            </p>
            <div className="mt-2.5 flex items-center gap-3">
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => generateWeek({ sectionId }), () => setAsking(false))}
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                Yes, rebuild it
              </Button>
              <button onClick={() => setAsking(false)} className="text-[13px] font-semibold text-ink-3">
                Leave it alone
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[12.5px] text-ink-3">
              Click any period to change it. A teacher already teaching elsewhere at that hour is shown as
              busy.
            </p>
            <button
              onClick={() => setAsking(true)}
              className="ml-auto inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand"
            >
              <Sparkles className="size-3.5" /> Rebuild the week
            </button>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-20 border border-line bg-paper-2 px-2 py-2 text-left">Day</th>
              {periods.map((p) => (
                <th key={p} className="border border-line bg-paper-2 px-2 py-2 text-center font-semibold">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, i) => (
              <tr key={day}>
                <td className="sticky left-0 z-10 border border-line bg-paper-2 px-2 py-2 font-semibold whitespace-nowrap">
                  {day.slice(0, 3)}
                </td>
                {periods.map((p) => {
                  const cell = at(i + 1, p);
                  const isEditing = editing === key(i + 1, p);
                  const busy = busyFor(i + 1, p);

                  if (isEditing) {
                    const chosen = subjects.find((s) => s.id === draft.subjectId);
                    return (
                      <td key={p} className="border-2 border-brand bg-brand-light/30 p-1.5 align-top" style={{ minWidth: 168 }}>
                        <select
                          value={draft.subjectId}
                          onChange={(e) => {
                            const next = subjects.find((s) => s.id === e.target.value);
                            // Offer the subject's own teacher, unless they are busy then.
                            const suggested = next?.teacherStaffIds.find(
                              (id) => !busy.some((b) => b.staffId === id),
                            );
                            setDraft({ ...draft, subjectId: e.target.value, staffId: suggested ?? "" });
                          }}
                          className={SELECT}
                          autoFocus
                        >
                          <option value="">Free period</option>
                          {subjects.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>

                        {draft.subjectId ? (
                          <select
                            value={draft.staffId}
                            onChange={(e) => setDraft({ ...draft, staffId: e.target.value })}
                            className={`${SELECT} mt-1`}
                          >
                            <option value="">Nobody yet</option>
                            {teachers.map((t) => {
                              const clash = busy.find((b) => b.staffId === t.staffId);
                              return (
                                <option key={t.staffId} value={t.staffId} disabled={Boolean(clash)}>
                                  {t.name}
                                  {clash ? ` — busy with ${clash.where}` : ""}
                                  {!clash && chosen?.teacherStaffIds.includes(t.staffId) ? " ✓" : ""}
                                </option>
                              );
                            })}
                          </select>
                        ) : null}

                        {draft.subjectId ? (
                          <>
                            <input
                              type="text"
                              value={draft.roomNo}
                              onChange={(e) => setDraft({ ...draft, roomNo: e.target.value })}
                              placeholder="Room no."
                              className={`${SELECT} mt-1`}
                            />
                            <input
                              type="text"
                              value={draft.meetingUrl}
                              onChange={(e) => setDraft({ ...draft, meetingUrl: e.target.value })}
                              placeholder="Meeting link (optional)"
                              className={`${SELECT} mt-1`}
                            />
                          </>
                        ) : null}

                        <div className="mt-1.5 flex items-center gap-2">
                          <button
                            onClick={() =>
                              run(
                                () =>
                                  setPeriod({
                                    sectionId,
                                    dayOfWeek: i + 1,
                                    period: p,
                                    subjectId: draft.subjectId || null,
                                    staffId: draft.staffId || null,
                                    roomNo: draft.roomNo || null,
                                    meetingUrl: draft.meetingUrl || null,
                                  }),
                                () => setEditing(null),
                              )
                            }
                            disabled={pending}
                            className="rounded-md bg-brand px-2 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
                          >
                            {pending ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="text-[12px] font-semibold text-ink-3 hover:text-ink"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={p}
                      onClick={() => open(i + 1, p)}
                      className="cursor-pointer border border-line px-2 py-1.5 align-top transition-colors hover:bg-brand-light/40"
                    >
                      {cell?.subjectName ? (
                        <>
                          <p className="text-[12px] font-medium">{cell.subjectName}</p>
                          <p className="mt-0.5 text-[10.5px] leading-tight text-ink-3">
                            {cell.staffName ?? "nobody assigned"}
                          </p>
                        </>
                      ) : (
                        <span className="text-[11.5px] text-ink-3">free</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-line px-5 py-2.5 text-[12px] text-ink-3">
        {teachers.length > 0 ? (
          <>
            Busiest week in the staff room:{" "}
            {[...teachers].sort((a, b) => b.periods - a.periods)[0]?.name} with{" "}
            {[...teachers].sort((a, b) => b.periods - a.periods)[0]?.periods} periods.
          </>
        ) : null}
      </p>
    </>
  );
}
