"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/components/ui/primitives";
import {
  createAcademicYear, createTerm, deleteAcademicYear, deleteTerm,
  generateTerms, renameTerm, setCurrentYear, setTermDueDate,
} from "./actions";

export type YearRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  invoices: number;
  structures: number;
  removable: boolean;
  whyNot: string | null;
};

export type TermRow = {
  label: string;
  dueDate: string;
  classes: number;
  mixed: boolean;
  invoices: number;
  removable: boolean;
  whyNot: string | null;
};

const INPUT = "h-9 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

const on = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });

function useRunner() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
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
  return { pending, error, setError, run };
}

function Err({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="mx-5 mt-4 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13.5px] text-overdue">
      {text}
    </p>
  );
}

/** Which year the school is in, and which years it has been through. */
export function YearEditor({ years }: { years: YearRow[] }) {
  const { pending, error, setError, run } = useRunner();
  const router = useRouter();
  const [confirming, setConfirming] = useState<{ yearId: string; name: string; sentence: string } | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");

  // A school typing 2027-28 almost certainly means April to March; offering it beats
  // making somebody work out two dates from a name they have already typed. Filled in
  // as they type rather than when they leave the field, so the dates are there to see
  // and correct before they reach for them — and only ever into empty boxes.
  function suggestDates(raw: string) {
    const m = /^(\d{4})/.exec(raw.trim());
    if (!m) return;
    const y = Number(m[1]);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) return;
    if (!startDate) setStart(`${y}-04-01`);
    if (!endDate) setEnd(`${y + 1}-03-31`);
  }

  return (
    <Card>
      <CardHead
        title="Academic years"
        hint="Exactly one year is current. Fees, exams and report cards all follow it."
      />
      <Err text={error} />

      <div className="flex flex-wrap items-end gap-2 border-b border-line px-5 py-4">
        <label className="w-32">
          <span className="mb-1.5 block text-[13px] font-semibold">Year</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              suggestDates(e.target.value);
            }}
            placeholder="2027-28"
            className={`${INPUT} w-full`}
          />
        </label>
        <label>
          <span className="mb-1.5 block text-[13px] font-semibold">Starts</span>
          <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className={`${INPUT} w-40`} />
        </label>
        <label>
          <span className="mb-1.5 block text-[13px] font-semibold">Ends</span>
          <input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} className={`${INPUT} w-40`} />
        </label>
        <Button
          size="sm"
          disabled={pending || !name.trim() || !startDate || !endDate}
          onClick={() =>
            run(() => createAcademicYear({ name, startDate, endDate }), () => {
              setName("");
              setStart("");
              setEnd("");
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add year
        </Button>
      </div>

      {confirming ? (
        <div className="mx-5 mt-4 rounded-md border border-marigold/35 bg-marigold-light/60 px-3.5 py-3">
          <p className="text-[13.5px] font-semibold">Remove {confirming.name}?</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{confirming.sentence}</p>
          <div className="mt-2.5 flex items-center gap-3">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                const target = confirming;
                setConfirming(null);
                run(() => deleteAcademicYear({ yearId: target.yearId, confirm: true }), () => router.refresh());
              }}
            >
              Yes, remove it
            </Button>
            <button onClick={() => setConfirming(null)} className="text-[13px] font-semibold text-ink-3">
              Keep it
            </button>
          </div>
        </div>
      ) : null}

      {years.length === 0 ? (
        <p className="px-5 py-6 text-center text-[14px] text-ink-3">
          No academic year yet. Everything else — fees, exams, report cards — belongs to a year, so this is
          the first thing to set.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {years.map((y) => (
            <li key={y.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5">
              <CalendarDays className="size-4 shrink-0 text-ink-3" />
              <span className="text-[14.5px] font-semibold">{y.name}</span>
              <span className="text-[12.5px] text-ink-3">
                {on(y.startDate)} – {on(y.endDate)}
              </span>
              {y.isCurrent ? <Badge tone="good">Current</Badge> : null}
              {y.invoices > 0 ? (
                <span className="text-[12px] text-ink-3">
                  {y.invoices.toLocaleString("en-IN")} invoices
                </span>
              ) : null}

              <span className="ml-auto flex items-center gap-3">
                {y.isCurrent ? null : (
                  <button
                    onClick={() => run(() => setCurrentYear({ yearId: y.id }))}
                    disabled={pending}
                    className="text-[13px] font-semibold text-ink-2 hover:text-brand"
                  >
                    Make current
                  </button>
                )}
                <button
                  onClick={() => {
                    if (!y.removable) {
                      setError(y.whyNot);
                      return;
                    }
                    setError(null);
                    run(async () => {
                      const r = await deleteAcademicYear({ yearId: y.id });
                      if ("confirm" in r && r.confirm) {
                        setConfirming({ yearId: y.id, name: y.name, sentence: r.confirm });
                        return {};
                      }
                      return r;
                    });
                  }}
                  title={y.whyNot ?? `Remove ${y.name}`}
                  className={y.removable ? "text-overdue hover:text-overdue/80" : "text-ink-3"}
                >
                  {y.removable ? <Trash2 className="size-3.5" /> : <X className="size-3.5" />}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * The terms the year is billed in.
 *
 * One row per term even though the schema keeps a copy per class — a school has one
 * Term 2, and editing one class's copy while twelve others keep the old date is the
 * mistake that shape invites.
 */
export function TermEditor({
  terms,
  yearName,
  canHaveTerms,
  whyNotYet,
}: {
  terms: TermRow[];
  yearName: string | null;
  canHaveTerms: boolean;
  whyNotYet: string | null;
}) {
  const { pending, error, setError, run } = useRunner();
  const [count, setCount] = useState("4");
  const [label, setLabel] = useState("");
  const [due, setDue] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: "", dueDate: "" });

  return (
    <Card>
      <CardHead
        title={yearName ? `Terms in ${yearName}` : "Terms"}
        hint="Fees are billed one term at a time. A term's due date is when a late fee could start counting."
      />
      <Err text={error} />

      {!canHaveTerms ? (
        <p className="px-5 py-6 text-[13.5px] leading-relaxed text-ink-2">{whyNotYet}</p>
      ) : (
        <>
          {terms.length === 0 ? (
            <div className="flex flex-wrap items-end gap-2 border-b border-line px-5 py-4">
              <label>
                <span className="mb-1.5 block text-[13px] font-semibold">Split the year into</span>
                <select value={count} onChange={(e) => setCount(e.target.value)} className={`${INPUT} w-44`}>
                  <option value="2">2 — halves</option>
                  <option value="3">3 — trimesters</option>
                  <option value="4">4 — terms</option>
                  <option value="6">6 — two-monthly</option>
                  <option value="12">12 — monthly</option>
                </select>
              </label>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => generateTerms({ count: Number(count) }))}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create terms
              </Button>
              <p className="w-full text-[12px] text-ink-3">
                Named after the months they cover, each due on the 15th of its first month. Every one of them
                can be changed afterwards.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2 border-b border-line px-5 py-4">
              <label className="min-w-[160px] flex-1">
                <span className="mb-1.5 block text-[13px] font-semibold">Add one more term</span>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Annual Day Fund (Nov)"
                  className={`${INPUT} w-full`}
                />
              </label>
              <label>
                <span className="mb-1.5 block text-[13px] font-semibold">Due</span>
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${INPUT} w-40`} />
              </label>
              <Button
                size="sm"
                disabled={pending || !label.trim() || !due}
                onClick={() =>
                  run(() => createTerm({ label, dueDate: due }), () => {
                    setLabel("");
                    setDue("");
                  })
                }
              >
                <Plus className="size-4" /> Add
              </Button>
            </div>
          )}

          <ul className="divide-y divide-line">
            {terms.map((t) => (
              <li key={t.label} className="px-5 py-3">
                {editing === t.label ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <input
                      value={draft.label}
                      onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                      className={`${INPUT} min-w-[160px] flex-1`}
                      autoFocus
                    />
                    <input
                      type="date"
                      value={draft.dueDate}
                      onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                      className={`${INPUT} w-40`}
                    />
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          if (draft.dueDate !== t.dueDate) {
                            const r = await setTermDueDate({ label: t.label, dueDate: draft.dueDate });
                            if (r.error) return r;
                          }
                          if (draft.label.trim() !== t.label) {
                            return renameTerm({ from: t.label, to: draft.label });
                          }
                          return {};
                        }, () => setEditing(null))
                      }
                    >
                      <Check className="size-3.5" /> Save
                    </Button>
                    <button onClick={() => setEditing(null)} className="text-[13px] font-semibold text-ink-3">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[14px] font-semibold">{t.label}</span>
                    <span className={`text-[12.5px] ${t.mixed ? "text-marigold" : "text-ink-3"}`}>
                      {t.mixed ? `classes disagree — earliest ${on(t.dueDate)}` : `due ${on(t.dueDate)}`}
                    </span>
                    {t.invoices > 0 ? (
                      <Badge tone="neutral">{t.invoices.toLocaleString("en-IN")} raised</Badge>
                    ) : null}

                    <span className="ml-auto flex items-center gap-2.5">
                      <button
                        onClick={() => {
                          setEditing(t.label);
                          setDraft({ label: t.label, dueDate: t.dueDate });
                        }}
                        className="flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-brand"
                      >
                        <Pencil className="size-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => (t.removable ? run(() => deleteTerm({ label: t.label })) : setError(t.whyNot))}
                        title={t.whyNot ?? `Remove ${t.label}`}
                        className={t.removable ? "text-overdue hover:text-overdue/80" : "text-ink-3"}
                      >
                        {t.removable ? <Trash2 className="size-3.5" /> : <X className="size-3.5" />}
                      </button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {terms.length > 0 ? (
            <p className="border-t border-line px-5 py-2.5 text-[12px] text-ink-3">
              A term applies to every priced class at once. Invoices already raised keep the name and the due
              date they were raised with — a term that moves in August cannot change what a parent was handed
              in April.
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
