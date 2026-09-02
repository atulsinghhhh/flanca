"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button, Card, CardHead } from "@/components/ui/primitives";
import { validateExamCycle, validateExamPaper, suggestPaperDates } from "@/lib/core/exam-core";
import { createExamCycle, deleteExamCycle, schedulePapers } from "./actions";

export type CycleOption = {
  name: string;
  startIso: string | null;
  endIso: string | null;
  weightage: number | null;
  classes: { classId: string; className: string; papers: number; subjects: number }[];
  removable: boolean;
  whyNot: string | null;
};

export type ClassOption = { id: string; name: string };

const INPUT = "h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

/**
 * Setting up an exam cycle, and scheduling its papers.
 *
 * Kept on the exams page rather than buried in settings, because it is the same
 * thought as looking at how much marks entry is left: this is the exam screen, and
 * an exam has to be created before it can be marked.
 */
export function ExamSetup({
  cycles,
  classes,
}: {
  cycles: CycleOption[];
  classes: ClassOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<"CYCLE" | "PAPERS" | null>(null);

  const [name, setName] = useState("");
  const [startIso, setStartIso] = useState("");
  const [endIso, setEndIso] = useState("");
  const [weightage, setWeightage] = useState("");

  const [cycleName, setCycleName] = useState(cycles[0]?.name ?? "");
  const [classId, setClassId] = useState("");
  const [paperStart, setPaperStart] = useState("");
  const [maxMarks, setMaxMarks] = useState("100");
  const [passMarks, setPassMarks] = useState("33");
  const [perDay, setPerDay] = useState("1");

  const others = cycles.filter((c) => c.weightage != null).map((c) => c.weightage!);
  const liveCycle = validateExamCycle({
    name,
    startIso: startIso || null,
    endIso: endIso || null,
    weightage: weightage.trim() === "" ? null : Number(weightage),
    existingNames: cycles.map((c) => c.name),
    otherWeightages: others,
  });

  const livePaper = validateExamPaper({
    maxMarks: maxMarks.trim() === "" ? null : Number(maxMarks),
    passMarks: passMarks.trim() === "" ? null : Number(passMarks),
  });

  const chosen = cycles.find((c) => c.name === cycleName);
  const chosenClass = chosen?.classes.find((c) => c.classId === classId);
  const toSchedule = chosenClass ? Math.max(0, chosenClass.subjects - chosenClass.papers) : 0;
  const preview =
    paperStart && toSchedule > 0 ? suggestPaperDates(paperStart, toSchedule, Number(perDay) || 1) : [];

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

  return (
    <Card className="mt-5">
      <CardHead
        title="Set up an exam"
        hint="A cycle covers every class at once. Papers are scheduled a class at a time, because the subjects differ."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(open === "CYCLE" ? null : "CYCLE")}
              className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand"
            >
              <Plus className="size-3.5" /> New cycle
            </button>
            <button
              onClick={() => setOpen(open === "PAPERS" ? null : "PAPERS")}
              disabled={cycles.length === 0}
              className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand disabled:opacity-40"
            >
              <CalendarPlus className="size-3.5" /> Schedule papers
            </button>
          </div>
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

      {open === "CYCLE" ? (
        <div className="border-b border-line px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Unit Test 2" className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">First paper</span>
              <input type="date" value={startIso} onChange={(e) => setStartIso(e.target.value)} className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Last paper</span>
              <input type="date" value={endIso} onChange={(e) => setEndIso(e.target.value)} className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Weight in the year</span>
              <div className="flex items-center gap-1.5">
                <input
                  value={weightage}
                  onChange={(e) => setWeightage(e.target.value.replace(/\D/g, ""))}
                  placeholder="20"
                  inputMode="numeric"
                  className={INPUT}
                />
                <span className="text-[14px] text-ink-3">%</span>
              </div>
            </label>
          </div>

          {liveCycle.messages.length > 0 ? (
            <ul className="mt-2.5 space-y-1">
              {liveCycle.messages.map((m, i) => (
                <li
                  key={i}
                  className={`text-[12.5px] leading-snug ${m.level === "ERROR" ? "text-overdue" : "text-marigold"}`}
                >
                  {m.message}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3 flex items-center gap-3">
            <Button
              size="sm"
              disabled={pending || !name.trim() || !liveCycle.ok}
              onClick={() =>
                run(
                  () =>
                    createExamCycle({
                      name,
                      startIso: startIso || null,
                      endIso: endIso || null,
                      weightage: weightage.trim() === "" ? null : Number(weightage),
                    }),
                  () => {
                    setNote(`${name.trim()} created for every class. Schedule its papers next.`);
                    setCycleName(name.trim());
                    setName("");
                    setStartIso("");
                    setEndIso("");
                    setWeightage("");
                    setOpen("PAPERS");
                  },
                )
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create cycle
            </Button>
            <button onClick={() => setOpen(null)} className="text-[13px] font-semibold text-ink-3">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {open === "PAPERS" ? (
        <div className="border-b border-line px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="lg:col-span-2">
              <span className="mb-1.5 block text-[13px] font-semibold">Cycle</span>
              <select value={cycleName} onChange={(e) => setCycleName(e.target.value)} className={INPUT}>
                {cycles.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="lg:col-span-2">
              <span className="mb-1.5 block text-[13px] font-semibold">Class</span>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={INPUT}>
                <option value="">Choose a class</option>
                {(chosen?.classes ?? []).map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.className}
                    {c.papers > 0 ? ` — ${c.papers} of ${c.subjects} scheduled` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">First paper</span>
              <input type="date" value={paperStart} onChange={(e) => setPaperStart(e.target.value)} className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Papers a day</span>
              <select value={perDay} onChange={(e) => setPerDay(e.target.value)} className={INPUT}>
                <option value="1">One</option>
                <option value="2">Two</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Out of</span>
              <input
                value={maxMarks}
                onChange={(e) => setMaxMarks(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className={INPUT}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Pass mark</span>
              <input
                value={passMarks}
                onChange={(e) => setPassMarks(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className={INPUT}
              />
            </label>
          </div>

          {livePaper.messages.length > 0 ? (
            <ul className="mt-2.5 space-y-1">
              {livePaper.messages.map((m, i) => (
                <li key={i} className={`text-[12.5px] ${m.level === "ERROR" ? "text-overdue" : "text-marigold"}`}>
                  {m.message}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-2">
            {!classId ? (
              "Choose a class to see what would be scheduled."
            ) : toSchedule === 0 ? (
              `Every subject in ${chosenClass?.className} already has a ${cycleName} paper.`
            ) : preview.length > 0 ? (
              <>
                {toSchedule} {toSchedule === 1 ? "paper" : "papers"} for {chosenClass?.className}, one per subject,{" "}
                {preview[0]} to {preview[preview.length - 1]} — Sundays skipped. Co-scholastic subjects are left
                out, because they are graded rather than marked.
              </>
            ) : (
              `${toSchedule} ${toSchedule === 1 ? "paper" : "papers"} to schedule. Choose the date of the first one.`
            )}
          </p>

          <div className="mt-3 flex items-center gap-3">
            <Button
              size="sm"
              disabled={pending || !classId || !paperStart || toSchedule === 0 || !livePaper.ok}
              onClick={() =>
                run(
                  () =>
                    schedulePapers({
                      cycleName,
                      classId,
                      startIso: paperStart,
                      maxMarks: Number(maxMarks),
                      passMarks: passMarks.trim() === "" ? null : Number(passMarks),
                      papersPerDay: Number(perDay) || 1,
                    }),
                  () => {
                    setNote(`${toSchedule} papers scheduled for ${chosenClass?.className}.`);
                    setClassId("");
                  },
                )
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
              Schedule {toSchedule > 0 ? toSchedule : ""} papers
            </Button>
            <button onClick={() => setOpen(null)} className="text-[13px] font-semibold text-ink-3">
              Done
            </button>
          </div>
        </div>
      ) : null}

      {cycles.length > 0 ? (
        <ul className="divide-y divide-line">
          {cycles.map((c) => {
            const scheduled = c.classes.reduce((a, x) => a + x.papers, 0);
            const possible = c.classes.reduce((a, x) => a + x.subjects, 0);
            return (
              <li key={c.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
                <span className="text-[13.5px] font-semibold">{c.name}</span>
                <span className="text-[12.5px] text-ink-3">
                  {scheduled} of {possible} papers scheduled across {c.classes.length}{" "}
                  {c.classes.length === 1 ? "class" : "classes"}
                  {c.weightage != null ? ` · ${c.weightage}% of the year` : " · no weight set"}
                </span>
                <button
                  onClick={() =>
                    c.removable ? run(() => deleteExamCycle({ cycleName: c.name })) : setError(c.whyNot)
                  }
                  title={c.whyNot ?? `Remove ${c.name}`}
                  className={`ml-auto ${c.removable ? "text-overdue hover:text-overdue/80" : "text-ink-3"}`}
                >
                  {c.removable ? <Trash2 className="size-3.5" /> : <X className="size-3.5" />}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}
