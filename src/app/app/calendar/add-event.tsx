"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { addCalendarEvent } from "@/app/app/notices/actions";

const KINDS = [
  { value: "HOLIDAY", label: "Holiday" },
  { value: "EXAM", label: "Exam" },
  { value: "PTM", label: "Parent-teacher meeting" },
  { value: "EVENT", label: "Event" },
  { value: "ACTIVITY", label: "Activity" },
];

export function AddEvent({ today }: { today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("HOLIDAY");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [details, setDetails] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  function submit() {
    setError(null);
    start(async () => {
      const r = await addCalendarEvent({
        title,
        kind,
        startDate,
        endDate: endDate || undefined,
        details: details || undefined,
        isPublic,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      setTitle("");
      setDetails("");
      setEndDate("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <CalendarPlus className="size-4" /> Add a date
      </Button>
    );
  }

  return (
    <div className="card mb-5 overflow-hidden">
      <header className="border-b border-line px-5 py-3">
        <h2 className="text-[15px] font-semibold">Add to the calendar</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          A holiday added here is excluded from attendance automatically.
        </p>
      </header>

      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="title" className="eyebrow text-ink-3 mb-1 block">
            What is it?
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Diwali Break"
            className="h-10 w-full rounded-md border border-line-2 bg-white px-3 text-[14.5px] outline-none focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor="kind" className="eyebrow text-ink-3 mb-1 block">
            Type
          </label>
          <select
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="start" className="eyebrow text-ink-3 mb-1 block">
              From
            </label>
            <input
              id="start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
            />
          </div>
          <div>
            <label htmlFor="end" className="eyebrow text-ink-3 mb-1 block">
              To (optional)
            </label>
            <input
              id="end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="details" className="eyebrow text-ink-3 mb-1 block">
            Details (optional)
          </label>
          <input
            id="details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="h-10 w-full rounded-md border border-line-2 bg-white px-3 text-[14px] outline-none focus:border-brand"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] sm:col-span-2">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="size-3.5 accent-[var(--color-brand)]"
          />
          Show this to parents on the school calendar
        </label>

        {error ? <p className="text-[12.5px] text-overdue sm:col-span-2">{error}</p> : null}

        <div className="flex gap-2 sm:col-span-2">
          <Button onClick={submit} disabled={pending || !title.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
            Add to calendar
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
