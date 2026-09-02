"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, ShieldCheck, Undo2, X } from "lucide-react";
import type { ConsentPurpose, ConsentState } from "@prisma/client";
import { Badge, Button } from "@/components/ui/primitives";
import { VERIFICATION_METHODS } from "@/lib/core/consent-core";
import { bulkConsent, recordConsent } from "./actions";

export type ConsentRow = {
  id: string;
  name: string;
  admissionNumber: string;
  className: string;
  phone: string | null;
  records: Array<{
    purpose: string;
    label: string;
    state: string;
    verifiedVia: string | null;
    grantedAt: Date | null;
  }>;
  missingCount: number;
};

const STATE_MARK: Record<string, { glyph: string; className: string; title: string }> = {
  GRANTED: { glyph: "✓", className: "bg-good-light text-good", title: "Granted" },
  PENDING: { glyph: "·", className: "bg-paper-2 text-ink-3", title: "Not yet asked" },
  REFUSED: { glyph: "✕", className: "bg-overdue-light text-overdue", title: "Refused" },
  WITHDRAWN: { glyph: "↩", className: "bg-marigold-light text-marigold-ink", title: "Withdrawn" },
};

export function ConsentTable({
  rows,
  purposes,
}: {
  rows: ConsentRow[];
  purposes: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [purpose, setPurpose] = useState<string>(purposes[0]?.value ?? "ENROLMENT_DATA");
  const [method, setMethod] = useState<string>("OTP_PHONE");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [indivPurpose, setIndivPurpose] = useState<string>(purposes[0]?.value ?? "ENROLMENT_DATA");
  const [indivMethod, setIndivMethod] = useState<string>("OTP_PHONE");
  const [indivName, setIndivName] = useState("");
  const [indivRef, setIndivRef] = useState("");
  const [indivPending, indivStart] = useTransition();
  const [indivMessage, setIndivMessage] = useState<string | null>(null);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function apply(state: ConsentState) {
    setMessage(null);
    start(async () => {
      const r = await bulkConsent({
        studentIds: [...selected],
        purpose: purpose as ConsentPurpose,
        state,
        verifiedVia: state === "GRANTED" ? method : undefined,
      });
      if (r.error) {
        setMessage(r.error);
        return;
      }
      setMessage(`${r.count} records updated.`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function toggleExpanded(row: ConsentRow) {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    setIndivMessage(null);
    setIndivName("");
    setIndivRef("");
  }

  function recordIndividual(studentId: string, state: ConsentState) {
    setIndivMessage(null);
    indivStart(async () => {
      const r = await recordConsent({
        studentId,
        purpose: indivPurpose as ConsentPurpose,
        state,
        verifiedVia: state === "GRANTED" ? indivMethod : undefined,
        grantedByName: indivName.trim() || undefined,
        verifiedRef: indivRef.trim() || undefined,
      });
      if (r.error) {
        setIndivMessage(r.error);
        return;
      }
      setIndivMessage(`Recorded${r.receiptNo ? ` — receipt ${r.receiptNo}` : ""}.`);
      router.refresh();
    });
  }

  return (
    <>
      {selected.size > 0 ? (
        <div className="space-y-2.5 border-b border-line bg-brand-light/50 px-5 py-3">
          <p className="text-[13px] font-semibold text-brand-ink">
            {selected.size} student{selected.size === 1 ? "" : "s"} selected
          </p>
          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <label htmlFor="purpose" className="eyebrow text-ink-3 mb-1 block">
                Purpose
              </label>
              <select
                id="purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
              >
                {purposes.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="method" className="eyebrow text-ink-3 mb-1 block">
                How was the parent verified?
              </label>
              <select
                id="method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
              >
                {VERIFICATION_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label} · {m.strength}
                  </option>
                ))}
              </select>
            </div>

            <Button size="sm" disabled={pending} onClick={() => apply("GRANTED")}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Record consent given
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => apply("REFUSED")}>
              <X className="size-4" /> Record refusal
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => apply("WITHDRAWN")}>
              <Undo2 className="size-4" /> Record withdrawal
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
          <p className="text-[11.5px] text-brand-ink/80">
            The verification method is stored with each record — that is what makes the consent
            &ldquo;verifiable&rdquo; under the Act, and what an auditor asks to see.
          </p>
        </div>
      ) : null}

      {message ? (
        <p className="border-b border-line bg-good-light px-5 py-2 text-[13px] text-good">{message}</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="ruled w-full min-w-[900px]">
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
              {purposes.map((p) => (
                <th key={p.value} className="w-20 text-center">
                  {p.label.split(" ")[0]}
                </th>
              ))}
              <th>Status</th>
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
                <td data-label="Class" className="whitespace-nowrap text-ink-2">{r.className}</td>
                {purposes.map((p) => {
                  const rec = r.records.find((x) => x.purpose === p.value);
                  const mark = STATE_MARK[rec?.state ?? "PENDING"];
                  return (
                    <td key={p.value} data-label={p.label.split(" ")[0]} className="text-center">
                      <span
                        title={`${p.label}: ${mark.title}${rec?.verifiedVia ? ` (${rec.verifiedVia.replace(/_/g, " ").toLowerCase()})` : ""}`}
                        className={`inline-flex size-6 items-center justify-center rounded text-[12px] font-bold ${mark.className}`}
                      >
                        {mark.glyph}
                      </span>
                    </td>
                  );
                })}
                <td data-label="Status">
                  {r.missingCount === 0 ? (
                    <Badge tone="good">
                      <ShieldCheck className="size-3" /> Complete
                    </Badge>
                  ) : (
                    <Badge tone="warn">{r.missingCount} missing</Badge>
                  )}
                </td>
                <td data-label="">
                  <button
                    onClick={() => toggleExpanded(r)}
                    className="whitespace-nowrap text-[12.5px] font-semibold text-brand hover:underline"
                  >
                    {expandedId === r.id ? "Close" : "Record individually"}
                  </button>
                </td>
              </tr>
              {expandedId === r.id ? (
                <tr>
                  <td colSpan={purposes.length + 5} className="bg-paper-2/50 px-5 py-3">
                    <div className="flex flex-wrap items-end gap-2.5">
                      <div>
                        <label className="eyebrow text-ink-3 mb-1 block">Purpose</label>
                        <select
                          value={indivPurpose}
                          onChange={(e) => setIndivPurpose(e.target.value)}
                          className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
                        >
                          {purposes.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="eyebrow text-ink-3 mb-1 block">How was the parent verified?</label>
                        <select
                          value={indivMethod}
                          onChange={(e) => setIndivMethod(e.target.value)}
                          className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
                        >
                          {VERIFICATION_METHODS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label} · {m.strength}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="eyebrow text-ink-3 mb-1 block">Given by</label>
                        <input
                          value={indivName}
                          onChange={(e) => setIndivName(e.target.value)}
                          placeholder="Parent or guardian's name"
                          className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
                        />
                      </div>
                      <div>
                        <label className="eyebrow text-ink-3 mb-1 block">Verification reference</label>
                        <input
                          value={indivRef}
                          onChange={(e) => setIndivRef(e.target.value)}
                          placeholder="OTP ref, form no."
                          className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
                        />
                      </div>
                      <Button size="sm" disabled={indivPending} onClick={() => recordIndividual(r.id, "GRANTED")}>
                        {indivPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        Record consent given
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={indivPending}
                        onClick={() => recordIndividual(r.id, "REFUSED")}
                      >
                        <X className="size-4" /> Record refusal
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={indivPending}
                        onClick={() => recordIndividual(r.id, "WITHDRAWN")}
                      >
                        <Undo2 className="size-4" /> Withdraw consent
                      </Button>
                    </div>
                    {indivMessage ? <p className="mt-2 text-[12.5px] text-good">{indivMessage}</p> : null}
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
