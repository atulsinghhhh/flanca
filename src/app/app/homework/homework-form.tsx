"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/components/ui/primitives";
import { defaultDueDate, validateHomework } from "@/lib/core/homework-core";
import { deleteHomework, setHomework } from "./actions";

export type SectionOption = {
  sectionId: string;
  label: string;
  subjects: { id: string; name: string }[];
};

export type RecentHomework = {
  id: string;
  title: string;
  label: string;
  dueOn: string | null;
  submissions: number;
  status: "DRAFT" | "ASSIGNED" | "CLOSED";
  removable: boolean;
  whyNot: string | null;
};

const INPUT = "h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

/**
 * Setting homework, from the screen that lists it.
 *
 * Only the sections this person actually stands in front of are offered — the server
 * decides that, and this only ever shows what it was given.
 */
export function HomeworkForm({
  sections,
  todayIso,
  mine,
}: {
  sections: SectionOption[];
  todayIso: string;
  mine: RecentHomework[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [sectionId, setSectionId] = useState(sections[0]?.sectionId ?? "");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueIso, setDueIso] = useState(defaultDueDate(todayIso));
  const [maxMarksText, setMaxMarksText] = useState("");

  const section = sections.find((s) => s.sectionId === sectionId);
  const maxMarks = maxMarksText.trim() === "" ? null : Number(maxMarksText);
  const live = validateHomework({ title, details, dueIso, todayIso, maxMarks });

  function run(fn: () => Promise<{ error?: string } | undefined>, after?: () => void) {
    setError(null);
    setNote(null);
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

  if (sections.length === 0) return null;

  return (
    <Card className="mt-5">
      <CardHead
        title="Set homework"
        hint="It appears on every parent's home screen in that section straight away."
        action={
          <button
            onClick={() => setOpen(!open)}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand"
          >
            {open ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {open ? "Close" : "New homework"}
          </button>
        }
      />

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

      {open ? (
        <div className="border-b border-line px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Section</span>
              <select
                value={sectionId}
                onChange={(e) => {
                  setSectionId(e.target.value);
                  setSubjectId("");
                }}
                className={INPUT}
              >
                {sections.map((s) => (
                  <option key={s.sectionId} value={s.sectionId}>{s.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Subject</span>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={INPUT}>
                <option value="">Not for one subject</option>
                {(section?.subjects ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="lg:col-span-2">
              <span className="mb-1.5 block text-[13px] font-semibold">What is set</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Exercise 4B, sums 1–10"
                className={INPUT}
              />
            </label>
            <label className="sm:col-span-2 lg:col-span-3">
              <span className="mb-1.5 block text-[13px] font-semibold">Anything more (optional)</span>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={2}
                placeholder="Show the working. Bring the graph sheet."
                className="w-full rounded-md border border-line-2 bg-white px-2.5 py-2 text-[14px] outline-none focus:border-brand"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Due</span>
              <input type="date" value={dueIso} onChange={(e) => setDueIso(e.target.value)} className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Marks (optional)</span>
              <input
                value={maxMarksText}
                onChange={(e) => setMaxMarksText(e.target.value)}
                placeholder="e.g. 20"
                inputMode="numeric"
                className={INPUT}
              />
            </label>
          </div>

          {live.messages.length > 0 ? (
            <ul className="mt-2.5 space-y-1">
              {live.messages.map((m, i) => (
                <li key={i} className={`text-[12.5px] ${m.level === "ERROR" ? "text-overdue" : "text-marigold"}`}>
                  {m.message}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              disabled={pending || !title.trim() || !live.ok || !sectionId}
              onClick={() =>
                run(
                  () => setHomework({ sectionId, subjectId: subjectId || null, title, details, dueIso, maxMarks, publish: true }),
                  () => {
                    setNote(`Set for ${section?.label}. Students can hand it in now.`);
                    setTitle("");
                    setDetails("");
                    setMaxMarksText("");
                  },
                )
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Set homework
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || !title.trim() || !live.ok || !sectionId}
              onClick={() =>
                run(
                  () => setHomework({ sectionId, subjectId: subjectId || null, title, details, dueIso, maxMarks, publish: false }),
                  () => {
                    setNote(`Saved as a draft for ${section?.label}. Publish it from the homework page when ready.`);
                    setTitle("");
                    setDetails("");
                    setMaxMarksText("");
                  },
                )
              }
            >
              Save as draft
            </Button>
            <span className="text-[12px] text-ink-3">
              {sections.length === 1
                ? "You teach one section."
                : `You can set homework for ${sections.length} sections.`}
            </span>
          </div>
        </div>
      ) : null}

      {mine.length > 0 ? (
        <ul className="divide-y divide-line">
          {mine.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
              <Link href={`/app/homework/${h.id}`} className="text-[13.5px] font-medium hover:text-brand">
                {h.title}
              </Link>
              {h.status === "DRAFT" ? <Badge tone="neutral">Draft</Badge> : null}
              {h.status === "CLOSED" ? <Badge tone="bad">Closed</Badge> : null}
              <span className="text-[12px] text-ink-3">
                {h.label}
                {h.dueOn ? ` · due ${h.dueOn}` : ""}
                {h.submissions > 0 ? ` · ${h.submissions} handed in` : ""}
              </span>
              <button
                onClick={() => (h.removable ? run(() => deleteHomework({ homeworkId: h.id })) : setError(h.whyNot))}
                title={h.whyNot ?? "Remove"}
                className={`ml-auto ${h.removable ? "text-overdue hover:text-overdue/80" : "text-ink-3"}`}
              >
                {h.removable ? <Trash2 className="size-3.5" /> : <X className="size-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
