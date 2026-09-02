"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CloudOff, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { formatPercent, gradeFor, percentBp } from "@/lib/core/grading-core";
import { saveMarks } from "../actions";

type Row = {
  id: string;
  name: string;
  rollNumber: number | null;
  sectionName: string;
  marks: number | null;
  isAbsent: boolean;
};

type Draft = { value: string; absent: boolean };

function storageKey(examId: string) {
  return `flanca:marks:${examId}`;
}

/**
 * Marks entry that behaves like a spreadsheet: type, press Enter, you are on the
 * next student. Never a form with a Save button per row — a teacher entering 40
 * marks should touch the mouse zero times.
 */
export function MarksGrid({
  examId,
  maxMarks,
  passMarks,
  students,
  locked,
}: {
  examId: string;
  maxMarks: number;
  passMarks: number;
  students: Row[];
  locked: boolean;
}) {
  const router = useRouter();
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const [draft, setDraft] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      students.map((s) => [s.id, { value: s.marks == null ? "" : String(s.marks), absent: s.isAbsent }]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restored = useRef(false);

  // Recover anything typed but never sent — a dropped connection mid-entry is
  // the single most infuriating thing that can happen to a teacher.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(storageKey(examId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { draft: Record<string, Draft>; pending: boolean };
      if (parsed.draft) {
        setDraft((d) => ({ ...d, ...parsed.draft }));
        if (parsed.pending) setQueued(true);
      }
    } catch {
      /* a corrupt cache must never block entry */
    }
  }, [examId]);

  const persist = useCallback(
    (next: Record<string, Draft>, pending: boolean) => {
      try {
        localStorage.setItem(storageKey(examId), JSON.stringify({ draft: next, pending }));
      } catch {
        /* private browsing — entry still works */
      }
    },
    [examId],
  );

  function update(id: string, patch: Partial<Draft>) {
    setDraft((prev) => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      persist(next, true);
      return next;
    });
  }

  function focusRow(index: number) {
    const el = inputs.current[index];
    if (el) {
      el.focus();
      el.select();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      focusRow(Math.min(index + 1, students.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusRow(Math.max(index - 1, 0));
    }
  }

  const stats = useMemo(() => {
    // Out-of-range typos are excluded from the class picture — a stray 950
    // must not drag the displayed average to 352%.
    const values = students
      .map((s) => draft[s.id])
      .filter((d) => d && !d.absent && d.value.trim() !== "")
      .map((d) => Number(d.value))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= maxMarks);

    const absent = students.filter((s) => draft[s.id]?.absent).length;
    const blank = students.filter((s) => {
      const d = draft[s.id];
      return d && !d.absent && d.value.trim() === "";
    }).length;

    const failing = values.filter((v) => v < passMarks).length;
    const invalid = students.filter((s) => {
      const d = draft[s.id];
      if (!d || d.absent || d.value.trim() === "") return false;
      const n = Number(d.value);
      return !Number.isFinite(n) || n < 0 || n > maxMarks;
    }).length;

    return {
      entered: values.length,
      absent,
      blank,
      failing,
      invalid,
      average: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      highest: values.length > 0 ? Math.max(...values) : 0,
    };
  }, [draft, students, passMarks, maxMarks]);

  async function save() {
    setSaving(true);
    setError(null);

    try {
      const result = await saveMarks({
        examId,
        entries: students.map((s) => {
          const d = draft[s.id];
          const raw = d?.value.trim() ?? "";
          return {
            studentId: s.id,
            marks: d?.absent || raw === "" ? null : Number(raw),
            isAbsent: Boolean(d?.absent),
          };
        }),
      });

      if (result.error) {
        setError(result.error);
        persist(draft, true);
        setQueued(true);
        return;
      }

      setSavedAt(new Date());
      setQueued(false);
      persist(draft, false);
      router.refresh();
    } catch {
      persist(draft, true);
      setQueued(true);
      setError(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {queued ? (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-info/25 bg-info-light px-4 py-2.5 text-[13px] text-info">
          <CloudOff className="size-4 shrink-0" />
          <p>
            Marks are saved on this device but not yet sent. Nothing is lost — press save again when
            the connection is back.
          </p>
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line bg-paper-2/50 px-4 py-2.5 text-[12.5px]">
          <span className="text-ink-2">
            Max <strong className="tnum">{maxMarks}</strong>
          </span>
          <span className="text-ink-2">
            Pass <strong className="tnum">{passMarks}</strong>
          </span>
          <span className="text-ink-3">Type a mark and press Enter to drop to the next student.</span>
        </div>

        <div className="overflow-x-auto">
          <table className="ruled w-full min-w-[620px]">
            <thead>
              <tr>
                <th className="w-14">Roll</th>
                <th>Student</th>
                <th className="w-16">Sec</th>
                <th className="num w-32">Marks</th>
                <th className="w-24">Grade</th>
                <th className="w-24">Absent</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => {
                const d = draft[s.id] ?? { value: "", absent: false };
                const n = Number(d.value);
                const hasValue = !d.absent && d.value.trim() !== "" && Number.isFinite(n);
                const invalid = hasValue && (n < 0 || n > maxMarks);
                const failing = hasValue && !invalid && n < passMarks;
                const grade = hasValue && !invalid ? gradeFor(percentBp(n, maxMarks))?.grade : null;

                return (
                  <tr key={s.id} className={invalid ? "bg-overdue-light/50" : undefined}>
                    <td data-label="Roll" className="num text-ink-3">{s.rollNumber ?? "—"}</td>
                    <td data-title className="font-medium">{s.name}</td>
                    <td data-label="Sec" className="text-ink-3">{s.sectionName || "—"}</td>
                    <td data-label="Marks" className="num">
                      <input
                        ref={(el) => {
                          inputs.current[i] = el;
                        }}
                        inputMode="numeric"
                        disabled={locked || d.absent}
                        value={d.absent ? "" : d.value}
                        onChange={(e) => update(s.id, { value: e.target.value.replace(/[^\d.]/g, "") })}
                        onKeyDown={(e) => onKeyDown(e, i)}
                        placeholder={d.absent ? "AB" : "—"}
                        className={`h-9 w-24 rounded-md border bg-white px-2 text-right text-[15px] tnum outline-none disabled:bg-paper-2 disabled:text-ink-3 ${
                          invalid ? "border-overdue text-overdue" : "border-line-2 focus:border-brand"
                        }`}
                      />
                    </td>
                    <td data-label="Grade">
                      {invalid ? (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-overdue">
                          <TriangleAlert className="size-3.5" /> over {maxMarks}
                        </span>
                      ) : d.absent ? (
                        <span className="text-[12.5px] text-ink-3">Absent</span>
                      ) : grade ? (
                        <span className={`text-[13px] font-semibold ${failing ? "text-overdue" : ""}`}>
                          {grade}
                        </span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td data-label="Absent">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px]">
                        <input
                          type="checkbox"
                          disabled={locked}
                          checked={d.absent}
                          onChange={(e) => update(s.id, { absent: e.target.checked })}
                          className="size-3.5 accent-[var(--color-brand)]"
                        />
                        AB
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── live class picture while typing, and the save ── */}
      <div className="sticky bottom-0 z-20 mt-4 -mx-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <span className="text-[13.5px] font-semibold">
            {stats.entered} of {students.length} entered
          </span>
          {stats.absent > 0 ? <span className="text-[13px] text-ink-3">{stats.absent} absent</span> : null}
          {stats.blank > 0 ? (
            <span className="text-[13px] text-marigold-ink">{stats.blank} still blank</span>
          ) : null}
          {stats.entered > 0 ? (
            <>
              <span className="text-[13px] text-ink-2">
                Average <strong className="tnum">{stats.average.toFixed(1)}</strong> /{" "}
                {maxMarks} ({formatPercent(percentBp(stats.average, maxMarks), 0)})
              </span>
              <span className="text-[13px] text-ink-2">
                Highest <strong className="tnum">{stats.highest}</strong>
              </span>
              {stats.failing > 0 ? (
                <span className="text-[13px] font-semibold text-overdue">{stats.failing} below pass</span>
              ) : null}
            </>
          ) : null}

          <div className="ml-auto flex items-center gap-3">
            {savedAt && !queued ? (
              <span className="flex items-center gap-1.5 text-[12.5px] text-good">
                <Check className="size-3.5" /> Saved{" "}
                {savedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
              </span>
            ) : null}
            <Button size="lg" onClick={save} disabled={saving || locked || stats.invalid > 0}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {saving ? "Saving…" : "Save marks"}
            </Button>
          </div>
        </div>

        {stats.invalid > 0 ? (
          <p className="mt-2 text-[12.5px] font-semibold text-overdue">
            {stats.invalid} mark{stats.invalid === 1 ? " is" : "s are"} above the maximum of {maxMarks}.
            Fix them before saving.
          </p>
        ) : null}
        {error ? <p className="mt-2 text-[12.5px] text-overdue">{error}</p> : null}
        {locked ? (
          <p className="mt-2 text-[12.5px] text-ink-3">
            This term is published — marks are locked. Unpublish it to make a correction.
          </p>
        ) : null}
      </div>
    </>
  );
}
