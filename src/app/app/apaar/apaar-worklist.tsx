"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ClipboardPaste, Loader2, Pencil, Phone, Send, UserCheck } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { adoptAadhaarName, bulkRecordApaarIds, markSubmitted, updateApaar } from "./actions";
import { APAAR_STATES } from "@/lib/core/apaar-core";

export type WorkRow = {
  id: string;
  name: string;
  admissionNumber: string;
  className: string;
  sectionName: string;
  guardianPhone: string | null;
  apaarId: string | null;
  penNumber: string | null;
  aadhaarName: string | null;
  apaarNote: string | null;
  state: string;
  nextAction: string;
  nameMatches: boolean;
  nameReason: string | null;
};

const STATE_TONE: Record<string, "warn" | "bad" | "info" | "neutral"> = {
  MISMATCH: "bad",
  CONSENT_REFUSED: "bad",
  CONSENT_PENDING: "warn",
  NOT_STARTED: "neutral",
  SUBMITTED: "info",
};

const STATE_LABEL: Record<string, string> = {
  MISMATCH: "Name mismatch",
  CONSENT_REFUSED: "Parent refused",
  CONSENT_PENDING: "Consent due",
  NOT_STARTED: "Not started",
  SUBMITTED: "Awaiting UDISE+",
  ISSUED: "Issued",
};

export function ApaarWorklist({ rows }: { rows: WorkRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPenNumber, setEditPenNumber] = useState("");
  const [editAadhaarName, setEditAadhaarName] = useState("");
  const [editStatus, setEditStatus] = useState<string>(APAAR_STATES[0]);
  const [editNote, setEditNote] = useState("");
  const [editPending, editStart] = useTransition();
  const [editMessage, setEditMessage] = useState<string | null>(null);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function act(fn: () => Promise<{ ok?: boolean; error?: string; count?: number }>, describe: (n: number) => string) {
    setMessage(null);
    start(async () => {
      const r = await fn();
      if (r.error) {
        setMessage(r.error);
        return;
      }
      setMessage(describe(r.count ?? selected.size));
      setSelected(new Set());
      router.refresh();
    });
  }

  function toggleEdit(row: WorkRow) {
    if (editingId === row.id) {
      setEditingId(null);
      return;
    }
    setEditingId(row.id);
    setEditMessage(null);
    setEditPenNumber(row.penNumber ?? "");
    setEditAadhaarName(row.aadhaarName ?? "");
    setEditStatus(row.state);
    setEditNote(row.apaarNote ?? "");
  }

  function saveEdit(studentId: string) {
    setEditMessage(null);
    editStart(async () => {
      const r = await updateApaar({
        studentId,
        penNumber: editPenNumber,
        aadhaarName: editAadhaarName,
        status: editStatus,
        note: editNote,
      });
      if (r.error) {
        setEditMessage(r.error);
        return;
      }
      setEditMessage("Saved.");
      router.refresh();
    });
  }

  return (
    <>
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-light/50 px-5 py-2.5">
          <p className="text-[13px] font-semibold text-brand-ink">{selected.size} selected</p>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => act(() => markSubmitted([...selected]), (n) => `${n} marked as submitted to UDISE+.`)}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Mark submitted to UDISE+
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="border-b border-line bg-good-light px-5 py-2 text-[13px] text-good">{message}</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="ruled w-full min-w-[920px]">
          <thead>
            <tr>
              <th className="w-9">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                  className="size-3.5 accent-[var(--color-brand)]"
                />
              </th>
              <th>Student</th>
              <th>Class</th>
              <th>Status</th>
              <th>What to do next</th>
              <th>Parent</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
              <tr className={selected.has(r.id) ? "bg-brand-light/40" : undefined}>
                <td data-label="">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.name}`}
                    checked={selected.has(r.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      })
                    }
                    className="size-3.5 accent-[var(--color-brand)]"
                  />
                </td>
                <td data-title>
                  <Link
                    href={`/app/students/${r.id}`}
                    className="font-medium hover:text-brand hover:underline"
                  >
                    {r.name}
                  </Link>
                  <p className="font-mono text-[11.5px] text-ink-3">{r.admissionNumber}</p>
                </td>
                <td data-label="Class" className="whitespace-nowrap text-ink-2">
                  {r.className}
                  {r.sectionName ? ` ${r.sectionName}` : ""}
                </td>
                <td data-label="Status">
                  <Badge tone={STATE_TONE[r.state] ?? "neutral"}>{STATE_LABEL[r.state] ?? r.state}</Badge>
                </td>
                <td data-label="What to do next" className="max-w-[260px]">
                  <p className="text-[12.5px] text-ink-2">{r.nextAction}</p>
                  {!r.nameMatches && r.nameReason ? (
                    <p className="mt-0.5 text-[11.5px] text-marigold-ink">
                      {r.nameReason}
                      {r.aadhaarName ? ` — Aadhaar: “${r.aadhaarName}”` : ""}
                    </p>
                  ) : null}
                  {r.apaarNote ? (
                    <p className="mt-0.5 text-[11.5px] text-ink-3">{r.apaarNote}</p>
                  ) : null}
                </td>
                <td data-label="Parent">
                  {r.guardianPhone ? (
                    <a
                      href={`tel:${r.guardianPhone}`}
                      className="inline-flex items-center gap-1 font-mono text-[12px] text-ink-2 hover:text-brand"
                    >
                      <Phone className="size-3" /> {r.guardianPhone}
                    </a>
                  ) : (
                    <span className="text-[12px] text-overdue">no mobile</span>
                  )}
                </td>
                <td data-label="" className="space-y-1">
                  {!r.nameMatches && r.aadhaarName ? (
                    <button
                      disabled={pending}
                      onClick={() =>
                        act(() => adoptAadhaarName(r.id), () => `${r.name} renamed to match Aadhaar.`)
                      }
                      className="block whitespace-nowrap text-[12.5px] font-semibold text-brand hover:underline disabled:opacity-50"
                    >
                      <UserCheck className="mr-1 inline size-3.5" /> Use Aadhaar name
                    </button>
                  ) : null}
                  <button
                    onClick={() => toggleEdit(r)}
                    className="block whitespace-nowrap text-[12.5px] font-semibold text-brand hover:underline"
                  >
                    <Pencil className="mr-1 inline size-3.5" /> {editingId === r.id ? "Close" : "Edit"}
                  </button>
                </td>
              </tr>
              {editingId === r.id ? (
                <tr>
                  <td colSpan={7} className="bg-paper-2/50 px-5 py-3">
                    <div className="flex flex-wrap items-end gap-2.5">
                      <div>
                        <label className="eyebrow text-ink-3 mb-1 block">PEN number</label>
                        <input
                          value={editPenNumber}
                          onChange={(e) => setEditPenNumber(e.target.value)}
                          className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
                        />
                      </div>
                      <div>
                        <label className="eyebrow text-ink-3 mb-1 block">Aadhaar name</label>
                        <input
                          value={editAadhaarName}
                          onChange={(e) => setEditAadhaarName(e.target.value)}
                          className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
                        />
                      </div>
                      <div>
                        <label className="eyebrow text-ink-3 mb-1 block">Status</label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
                        >
                          {APAAR_STATES.map((s) => (
                            <option key={s} value={s}>
                              {STATE_LABEL[s] ?? s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-[220px] flex-1">
                        <label className="eyebrow text-ink-3 mb-1 block">Note</label>
                        <input
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          placeholder="Portal rejected — DOB mismatch"
                          className="h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
                        />
                      </div>
                      <Button size="sm" disabled={editPending} onClick={() => saveEdit(r.id)}>
                        {editPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        Save
                      </Button>
                    </div>
                    {editMessage ? <p className="mt-2 text-[12.5px] text-good">{editMessage}</p> : null}
                  </td>
                </tr>
              ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Paste the block UDISE+ hands back rather than typing 12-digit numbers by hand. */
export function BulkPaste() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ applied: number; problems: Array<{ line: number; raw: string; reason: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    setResult(null);
    start(async () => {
      const r = await bulkRecordApaarIds(value);
      if (r.error) {
        setError(r.error);
        return;
      }
      setResult({ applied: r.applied ?? 0, problems: r.problems ?? [] });
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <ClipboardPaste className="size-4" /> Paste IDs from UDISE+
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div>
        <label htmlFor="paste" className="eyebrow text-ink-3 mb-1 block">
          One per line: admission number, APAAR ID
        </label>
        <textarea
          id="paste"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={5}
          placeholder={"NPS/1001, 123456789012\nNPS/1002, 123456789013"}
          className="w-full rounded-md border border-line-2 bg-white px-3 py-2 font-mono text-[12.5px] outline-none focus:border-brand"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={submit} disabled={pending || !value.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Record these IDs
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      {error ? <p className="text-[12.5px] text-overdue">{error}</p> : null}

      {result ? (
        <div className="rounded-md border border-line bg-white px-3 py-2">
          <p className="text-[13px] font-semibold text-good">{result.applied} IDs recorded.</p>
          {result.problems.length > 0 ? (
            <>
              <p className="mt-1.5 text-[12.5px] font-semibold text-marigold-ink">
                {result.problems.length} line{result.problems.length === 1 ? "" : "s"} could not be matched:
              </p>
              <ul className="mt-1 space-y-0.5">
                {result.problems.slice(0, 8).map((p) => (
                  <li key={p.line} className="font-mono text-[11.5px] text-ink-2">
                    line {p.line}: {p.raw} — {p.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
