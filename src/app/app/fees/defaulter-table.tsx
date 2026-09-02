"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Coins, Loader2, MessageCircle, Phone, Send } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/core/money";
import { sendFeeReminders } from "./actions";

export type DefaulterRow = {
  studentId: string;
  name: string;
  admissionNumber: string;
  className: string;
  sectionName: string;
  phone: string | null;
  fatherName: string | null;
  outstanding: number;
  projectedFine: number;
  daysOverdue: number;
  bucket: string;
  invoiceCount: number;
  terms: string[];
};

const BUCKET_STYLE: Record<string, string> = {
  CURRENT: "text-ink-3",
  "1-30": "text-marigold-ink",
  "31-60": "text-amber-deep",
  "61-90": "text-rust",
  "90+": "text-overdue font-semibold",
};

export function DefaulterTable({ rows }: { rows: DefaulterRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function remind(channel: "IN_APP" | "WHATSAPP" | "SMS") {
    setResult(null);
    start(async () => {
      const r = await sendFeeReminders([...selected], channel);
      if (r.error) {
        setResult(r.error);
        return;
      }
      setResult(
        `${r.queued} reminder${r.queued === 1 ? "" : "s"} ${channel === "IN_APP" ? "sent in the parent app" : "queued"}${r.skipped ? ` · ${r.skipped} skipped (no mobile on record)` : ""}.`,
      );
      setSelected(new Set());
    });
  }

  return (
    <>
      {/* ── action bar appears only when something is selected ── */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-light/50 px-5 py-2.5">
          <p className="text-[13px] font-semibold text-brand-ink">
            {selected.size} parent{selected.size === 1 ? "" : "s"} selected
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => remind("IN_APP")}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Notify in app (free)
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => remind("WHATSAPP")}>
              <MessageCircle className="size-4" /> WhatsApp
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {result ? (
        <p className="border-b border-line bg-good-light px-5 py-2 text-[13px] text-good">{result}</p>
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
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.studentId)))}
                  className="size-3.5 accent-[var(--color-brand)]"
                />
              </th>
              <th>Student</th>
              <th>Class</th>
              <th>Parent</th>
              <th className="num">Outstanding</th>
              <th className="num">Late fee</th>
              <th className="num">Overdue</th>
              <th>Terms</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.studentId} className={selected.has(r.studentId) ? "bg-brand-light/40" : undefined}>
                <td data-label="">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.name}`}
                    checked={selected.has(r.studentId)}
                    onChange={() => toggle(r.studentId)}
                    className="size-3.5 accent-[var(--color-brand)]"
                  />
                </td>
                <td data-title>
                  <Link
                    href={`/app/students/${r.studentId}`}
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
                <td data-label="Parent">
                  <p className="text-[13px] text-ink-2">{r.fatherName ?? "—"}</p>
                  {r.phone ? (
                    <a
                      href={`tel:${r.phone}`}
                      className="inline-flex items-center gap-1 font-mono text-[11.5px] text-ink-3 hover:text-brand"
                    >
                      <Phone className="size-3" /> {r.phone}
                    </a>
                  ) : (
                    <span className="text-[11.5px] text-overdue">no mobile on record</span>
                  )}
                </td>
                <td data-label="Outstanding" className="num font-semibold">{formatMoney(r.outstanding)}</td>
                <td data-label="Late fee" className="num text-ink-3">
                  {r.projectedFine > 0 ? formatMoney(r.projectedFine) : "—"}
                </td>
                <td data-label="Overdue" className={`num whitespace-nowrap ${BUCKET_STYLE[r.bucket] ?? ""}`}>
                  {r.daysOverdue > 0 ? `${r.daysOverdue} days` : "not yet due"}
                </td>
                <td data-label="Terms" className="max-w-[190px] truncate text-[12.5px] text-ink-3">
                  {r.terms.length > 0 ? r.terms.join(", ") : `${r.invoiceCount} invoice(s)`}
                </td>
                <td data-label="">
                  <Link
                    href={`/app/fees/collect?student=${r.studentId}`}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
                  >
                    <Coins className="size-3.5" /> Collect
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
