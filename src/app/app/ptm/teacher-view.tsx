"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardHead, Empty } from "@/components/ui/primitives";
import { minutesToClock } from "@/lib/core/ptm-core";
import { cancelBooking, generateSlots, removeSlot } from "./actions";

export type PtmSectionOption = { sectionId: string; label: string };
export type PtmSlotRow = {
  id: string;
  dateIso: string;
  startMinute: number;
  endMinute: number;
  sectionLabel: string;
  booked: boolean;
  studentName: string | null;
  bookedByName: string | null;
  note: string | null;
};

const INPUT = "h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

const DATE_LABEL = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function TeacherPtmView({
  sections,
  todayIso,
  slots,
}: {
  sections: PtmSectionOption[];
  todayIso: string;
  slots: PtmSlotRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [sectionId, setSectionId] = useState(sections[0]?.sectionId ?? "");
  const [dateIso, setDateIso] = useState(todayIso);
  const [startClock, setStartClock] = useState("15:00");
  const [endClock, setEndClock] = useState("16:30");
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [slotNote, setSlotNote] = useState("");

  function run(fn: () => Promise<{ error?: string; created?: number } | undefined>, onOk?: (r: { created?: number }) => void) {
    setError(null);
    setNote(null);
    start(async () => {
      const r = (await fn()) ?? {};
      if (r.error) {
        setError(r.error);
        return;
      }
      onOk?.(r);
      router.refresh();
    });
  }

  const byDate = useMemo(() => {
    const map = new Map<string, PtmSlotRow[]>();
    for (const s of slots) map.set(s.dateIso, [...(map.get(s.dateIso) ?? []), s]);
    return [...map.entries()];
  }, [slots]);

  if (sections.length === 0) {
    return (
      <Card className="mt-5">
        <Empty title="No section to offer slots for." hint="A teacher needs to be a class teacher or on a section's timetable first." />
      </Card>
    );
  }

  return (
    <>
      <Card className="mt-5">
        <CardHead title="Open new slots" hint="Cut a block of time into fixed-size slots — parents book one each." />
        {error ? (
          <p className="mx-5 mt-4 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13.5px] text-overdue">
            {error}
          </p>
        ) : null}
        {note ? (
          <p className="mx-5 mt-4 rounded-md border border-good/25 bg-good-light px-3 py-2 text-[13.5px] font-medium text-good">
            {note}
          </p>
        ) : null}

        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-6">
          <label className="lg:col-span-2">
            <span className="mb-1.5 block text-[13px] font-semibold">Section</span>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className={INPUT}>
              {sections.map((s) => (
                <option key={s.sectionId} value={s.sectionId}>{s.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-semibold">Date</span>
            <input type="date" min={todayIso} value={dateIso} onChange={(e) => setDateIso(e.target.value)} className={INPUT} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-semibold">From</span>
            <input type="time" value={startClock} onChange={(e) => setStartClock(e.target.value)} className={INPUT} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-semibold">To</span>
            <input type="time" value={endClock} onChange={(e) => setEndClock(e.target.value)} className={INPUT} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-semibold">Each slot</span>
            <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className={INPUT}>
              {[5, 10, 15, 20, 30].map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2 lg:col-span-6">
            <span className="mb-1.5 block text-[13px] font-semibold">Note for parents (optional)</span>
            <input value={slotNote} onChange={(e) => setSlotNote(e.target.value)} placeholder="In the library, room 4" className={INPUT} />
          </label>
        </div>

        <div className="flex items-center gap-3 border-t border-line px-5 py-3.5">
          <Button
            size="sm"
            disabled={pending || !sectionId}
            onClick={() =>
              run(
                () => generateSlots({ sectionId, dateIso, startClock, endClock, durationMinutes, note: slotNote || null }),
                (r) => {
                  setNote(`Opened ${r.created ?? 0} slot${r.created === 1 ? "" : "s"}.`);
                  setSlotNote("");
                },
              )
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Open slots
          </Button>
        </div>
      </Card>

      <Card className="mt-5 overflow-hidden">
        <CardHead title="Upcoming slots" hint={`${slots.length} from today`} />
        {byDate.length === 0 ? (
          <Empty title="Nothing open yet." hint="Slots you open above will show here." />
        ) : (
          <ul className="divide-y divide-line">
            {byDate.map(([date, rows]) => (
              <li key={date} className="px-5 py-3">
                <p className="mb-2 text-[12.5px] font-semibold text-ink-3">{DATE_LABEL(date)}</p>
                <div className="space-y-1.5">
                  {rows.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line px-3 py-2">
                      <span className="text-[13px] font-medium tnum">
                        {minutesToClock(s.startMinute)}–{minutesToClock(s.endMinute)}
                      </span>
                      <span className="text-[12px] text-ink-3">{s.sectionLabel}</span>
                      {s.note ? <span className="w-full text-[11.5px] text-ink-3">{s.note}</span> : null}
                      {s.booked ? (
                        <>
                          <Badge tone="good">Booked — {s.studentName}</Badge>
                          <button
                            onClick={() => run(() => cancelBooking({ slotId: s.id }))}
                            disabled={pending}
                            className="ml-auto text-[12px] font-semibold text-overdue hover:text-overdue/80"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => run(() => removeSlot({ slotId: s.id }))}
                          disabled={pending}
                          className="ml-auto text-ink-3 hover:text-overdue"
                          title="Remove this slot"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
