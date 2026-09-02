"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/components/ui/primitives";
import { formatMoney, paiseFromText } from "@/lib/core/money";
import {
  createFeeHead, deleteFeeHead, moveFeeHead, setClassFees, updateFeeHead,
} from "./actions";

export type HeadRow = {
  id: string;
  name: string;
  code: string | null;
  isOptional: boolean;
  isRefundable: boolean;
  classesCharging: number;
  removable: boolean;
  whyNot: string | null;
};

export type ClassFeeRow = {
  classId: string;
  className: string;
  students: number;
  amounts: Record<string, number>; // feeHeadId → paise
  total: number;
  perTerm: number | null;
};

/** One term as the school thinks of it, gathering every class's copy of it. */
export type TermRow = {
  label: string;
  dueDate: string;      // the date if every class agrees, else the earliest
  classes: number;
  mixed: boolean;       // classes disagree on when this term is due
  invoices: number;
};

const INPUT = "h-9 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

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

/** What the school charges for. The order here is the order on the parent's invoice. */
export function FeeHeadsEditor({ heads }: { heads: HeadRow[] }) {
  const { pending, error, setError, run } = useRunner();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [optional, setOptional] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", code: "", isOptional: false, isRefundable: false });

  return (
    <Card>
      <CardHead
        title="Fee heads"
        hint="Each one is its own line on the invoice. An optional head is charged only to the families who take it — transport, for instance."
      />
      <Err text={error} />

      <div className="flex flex-wrap items-end gap-2 border-b border-line px-5 py-4">
        <label className="min-w-[150px] flex-1">
          <span className="mb-1.5 block text-[13px] font-semibold">Add a head</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lab Fee" className={`${INPUT} w-full`} />
        </label>
        <label className="w-24">
          <span className="mb-1.5 block text-[13px] font-semibold">Code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="LAB" className={`${INPUT} w-full`} />
        </label>
        <label className="flex h-9 items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={optional}
            onChange={(e) => setOptional(e.target.checked)}
            className="size-3.5 accent-[var(--color-brand)]"
          />
          Optional
        </label>
        <Button
          size="sm"
          disabled={pending || !name.trim()}
          onClick={() =>
            run(() => createFeeHead({ name, code, isOptional: optional }), () => {
              setName("");
              setCode("");
              setOptional(false);
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
        </Button>
      </div>

      <ul className="divide-y divide-line">
        {heads.map((h, i) => (
          <li key={h.id} className="px-5 py-3">
            {editing === h.id ? (
              <div className="flex flex-wrap items-end gap-2">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className={`${INPUT} min-w-[140px] flex-1`}
                  autoFocus
                />
                <input
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  placeholder="Code"
                  className={`${INPUT} w-20`}
                />
                <label className="flex h-9 items-center gap-1.5 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={draft.isOptional}
                    onChange={(e) => setDraft({ ...draft, isOptional: e.target.checked })}
                    className="size-3.5 accent-[var(--color-brand)]"
                  />
                  Optional
                </label>
                <label className="flex h-9 items-center gap-1.5 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={draft.isRefundable}
                    onChange={(e) => setDraft({ ...draft, isRefundable: e.target.checked })}
                    className="size-3.5 accent-[var(--color-brand)]"
                  />
                  Refundable
                </label>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => updateFeeHead({ feeHeadId: h.id, ...draft }), () => setEditing(null))}
                >
                  <Check className="size-3.5" /> Save
                </Button>
                <button onClick={() => setEditing(null)} className="text-[13px] font-semibold text-ink-3">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold">{h.name}</span>
                {h.code ? <span className="font-mono text-[11px] text-ink-3">{h.code}</span> : null}
                {h.isOptional ? <Badge tone="neutral">Optional</Badge> : null}
                {h.isRefundable ? <Badge tone="info">Refundable</Badge> : null}
                <span className="text-[12px] text-ink-3">
                  {h.classesCharging === 0
                    ? "no class charges it"
                    : `${h.classesCharging} ${h.classesCharging === 1 ? "class" : "classes"}`}
                </span>

                <span className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => run(() => moveFeeHead({ feeHeadId: h.id, direction: "UP" }))}
                    disabled={i === 0 || pending}
                    className="text-ink-3 hover:text-brand disabled:opacity-30"
                    aria-label={`Move ${h.name} up`}
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    onClick={() => run(() => moveFeeHead({ feeHeadId: h.id, direction: "DOWN" }))}
                    disabled={i === heads.length - 1 || pending}
                    className="text-ink-3 hover:text-brand disabled:opacity-30"
                    aria-label={`Move ${h.name} down`}
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setEditing(h.id);
                      setDraft({ name: h.name, code: h.code ?? "", isOptional: h.isOptional, isRefundable: h.isRefundable });
                    }}
                    className="ml-1 text-ink-2 hover:text-brand"
                    aria-label={`Edit ${h.name}`}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => (h.removable ? run(() => deleteFeeHead({ feeHeadId: h.id })) : setError(h.whyNot))}
                    title={h.whyNot ?? `Remove ${h.name}`}
                    className={h.removable ? "text-overdue hover:text-overdue/80" : "text-ink-3"}
                  >
                    {h.removable ? <Trash2 className="size-3.5" /> : <X className="size-3.5" />}
                  </button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * The annual fee, class by class.
 *
 * A whole row is edited and saved at once, because the row's total is what a term
 * invoice is divided out of — saving it head by head would leave the class briefly
 * priced at something nobody chose.
 */
export function FeeGrid({
  heads,
  rows,
  terms,
}: {
  heads: HeadRow[];
  rows: ClassFeeRow[];
  terms: number;
}) {
  const { pending, error, setError, run } = useRunner();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const draftTotal = Object.values(draft).reduce((a, t) => a + (paiseFromText(t) ?? 0), 0);
  const grandTotal = rows.reduce((a, r) => a + r.total, 0);

  function startEditing(row: ClassFeeRow) {
    setError(null);
    setEditing(row.classId);
    setDraft(
      Object.fromEntries(
        heads.map((h) => [h.id, row.amounts[h.id] ? String(row.amounts[h.id] / 100) : ""]),
      ),
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHead
        title="Annual fee by class"
        hint="Amounts are for the full year. Leave a cell blank when the head does not apply to that class."
        action={<Badge tone="brand">{formatMoney(grandTotal)} across all classes</Badge>}
      />
      <Err text={error} />

      <div className="overflow-x-auto">
        <table className="ruled w-full min-w-[820px]">
          <thead>
            <tr>
              <th>Class</th>
              {heads.map((h) => (
                <th key={h.id} className="num">
                  {h.name}
                  {h.isOptional ? <span className="ml-1 font-normal text-ink-3">(opt)</span> : null}
                </th>
              ))}
              <th className="num">Annual</th>
              <th className="num">Per term</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEditing = editing === r.classId;
              return (
                <tr key={r.classId} className={isEditing ? "bg-brand-light/40" : undefined}>
                  <td data-title className="font-medium whitespace-nowrap">
                    {r.className}
                    <span className="ml-1.5 text-[11.5px] font-normal text-ink-3">
                      {r.students} {r.students === 1 ? "child" : "children"}
                    </span>
                  </td>

                  {heads.map((h) =>
                    isEditing ? (
                      <td key={h.id} data-label={h.name} className="num">
                        <input
                          value={draft[h.id] ?? ""}
                          onChange={(e) => setDraft({ ...draft, [h.id]: e.target.value })}
                          inputMode="decimal"
                          placeholder="—"
                          aria-label={`${r.className} ${h.name}`}
                          className="h-8 w-24 rounded-md border border-line-2 bg-white px-2 text-right text-[13.5px] tabular-nums outline-none focus:border-brand"
                        />
                      </td>
                    ) : (
                      <td key={h.id} data-label={h.name} className="num">
                        {r.amounts[h.id] ? formatMoney(r.amounts[h.id]) : <span className="text-ink-3">—</span>}
                      </td>
                    ),
                  )}

                  <td data-label="Annual" className="num font-semibold">
                    {isEditing ? formatMoney(draftTotal) : formatMoney(r.total)}
                  </td>
                  <td data-label="Per term" className="num text-ink-2">
                    {isEditing ? (
                      terms > 0 ? formatMoney(Math.round(draftTotal / terms)) : <span className="text-ink-3">—</span>
                    ) : r.perTerm == null ? (
                      <span className="text-ink-3">—</span>
                    ) : (
                      formatMoney(r.perTerm)
                    )}
                  </td>

                  <td data-label="" className="whitespace-nowrap text-right">
                    {isEditing ? (
                      <span className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => run(() => setClassFees({ classId: r.classId, amounts: draft }), () => setEditing(null))}
                        >
                          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
                        </Button>
                        <button onClick={() => setEditing(null)} className="text-[13px] font-semibold text-ink-3">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => startEditing(r)}
                        className="flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-brand"
                      >
                        <Pencil className="size-3.5" /> Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-line px-5 py-2.5 text-[12px] text-ink-3">
        Changing an amount here decides what the <em>next</em> invoice says. Invoices already raised carry
        their own copy of every line, so a fee that changes in August cannot rewrite what a parent was
        billed in April.
      </p>
    </Card>
  );
}
