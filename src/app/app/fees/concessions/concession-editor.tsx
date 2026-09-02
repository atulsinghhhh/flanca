"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Percent, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/components/ui/primitives";
import { formatMoney, paiseFromText } from "@/lib/core/money";
import { fineAfterDays, validateConcessionType, validateFinePolicy } from "@/lib/core/concession-core";
import {
  approveConcession, createConcessionType, deleteConcessionType,
  revokeConcession, saveFinePolicy, updateConcessionType,
} from "./actions";

export type HeadOption = { id: string; name: string };

export type TypeRow = {
  id: string;
  name: string;
  percentage: number | null;
  fixedAmount: number | null;
  appliesToHeads: string[];
  requiresApproval: boolean;
  students: number;
  removable: boolean;
  whyNot: string | null;
};

export type PendingRow = {
  concessionId: string;
  studentName: string;
  admissionNumber: string;
  typeName: string;
  worth: string;
  note: string | null;
};

export type FinePolicy = {
  graceDays: number;
  flatAmount: number;
  perDayAmount: number;
  maxAmount: number | null;
  isActive: boolean;
};

const INPUT = "h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

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

function Messages({ list }: { list: { level: string; message: string }[] }) {
  if (list.length === 0) return null;
  return (
    <ul className="mt-2.5 space-y-1">
      {list.map((m, i) => (
        <li key={i} className={`text-[12.5px] leading-snug ${m.level === "ERROR" ? "text-overdue" : "text-marigold"}`}>
          {m.message}
        </li>
      ))}
    </ul>
  );
}

/** What the school gives away, and to whom. */
export function ConcessionTypes({ types, heads }: { types: TypeRow[]; heads: HeadOption[] }) {
  const { pending, error, setError, run } = useRunner();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    kind: "PERCENT" as "PERCENT" | "AMOUNT",
    percentage: "",
    amount: "",
    headIds: [] as string[],
    requiresApproval: true,
  });

  const live = validateConcessionType({
    name: form.name,
    percentage: form.kind === "PERCENT" && form.percentage.trim() !== "" ? Number(form.percentage) : null,
    fixedAmountPaise: form.kind === "AMOUNT" && form.amount.trim() !== "" ? paiseFromText(form.amount) : null,
    existingNames: types.filter((t) => t.id !== editing).map((t) => t.name),
  });

  const headName = (id: string) => heads.find((h) => h.id === id)?.name ?? "a removed head";

  function reset() {
    setForm({ name: "", kind: "PERCENT", percentage: "", amount: "", headIds: [], requiresApproval: true });
    setEditing(null);
    setOpen(false);
  }

  return (
    <Card>
      <CardHead
        title="Concessions"
        hint="Shown as its own line on the invoice, never hidden inside the total."
        action={
          <button
            onClick={() => {
              setOpen(!open);
              setEditing(null);
            }}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand"
          >
            {open ? <X className="size-3.5" /> : <Plus className="size-3.5" />} {open ? "Close" : "New"}
          </button>
        }
      />
      <Err text={error} />

      {open ? (
        <div className="border-b border-line px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Sibling"
                className={INPUT}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Takes off</span>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as "PERCENT" | "AMOUNT" })}
                className={INPUT}
              >
                <option value="PERCENT">A percentage</option>
                <option value="AMOUNT">A fixed amount</option>
              </select>
            </label>
            {form.kind === "PERCENT" ? (
              <label>
                <span className="mb-1.5 block text-[13px] font-semibold">Percentage</span>
                <input
                  value={form.percentage}
                  onChange={(e) => setForm({ ...form, percentage: e.target.value.replace(/\D/g, "") })}
                  inputMode="numeric"
                  placeholder="10"
                  className={INPUT}
                />
              </label>
            ) : (
              <label>
                <span className="mb-1.5 block text-[13px] font-semibold">Amount a year</span>
                <input
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  inputMode="decimal"
                  placeholder="6,000"
                  className={INPUT}
                />
              </label>
            )}
            <label className="flex h-9 items-end gap-2 pb-1 text-[13px]">
              <input
                type="checkbox"
                checked={form.requiresApproval}
                onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })}
                className="size-3.5 accent-[var(--color-brand)]"
              />
              Needs approving
            </label>
          </div>

          <div className="mt-3">
            <p className="text-[13px] font-semibold">Comes off which heads</p>
            <p className="mt-0.5 text-[12px] text-ink-3">
              Choose none and it comes off everything. A sibling or RTE concession is almost always tuition
              only.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {heads.map((h) => {
                const on = form.headIds.includes(h.id);
                return (
                  <button
                    key={h.id}
                    onClick={() =>
                      setForm({
                        ...form,
                        headIds: on ? form.headIds.filter((x) => x !== h.id) : [...form.headIds, h.id],
                      })
                    }
                    className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition ${
                      on ? "border-brand bg-brand text-white" : "border-line-2 bg-white text-ink-2 hover:border-brand"
                    }`}
                  >
                    {h.name}
                  </button>
                );
              })}
            </div>
          </div>

          <Messages list={live.messages} />

          <div className="mt-3 flex items-center gap-3">
            <Button
              size="sm"
              disabled={pending || !live.ok}
              onClick={() =>
                run(
                  () =>
                    editing
                      ? updateConcessionType({
                          concessionTypeId: editing,
                          name: form.name,
                          percentage: form.kind === "PERCENT" ? Number(form.percentage) : null,
                          fixedAmountText: form.kind === "AMOUNT" ? form.amount : null,
                          appliesToHeads: form.headIds,
                          requiresApproval: form.requiresApproval,
                        })
                      : createConcessionType({
                          name: form.name,
                          percentage: form.kind === "PERCENT" ? Number(form.percentage) : null,
                          fixedAmountText: form.kind === "AMOUNT" ? form.amount : null,
                          appliesToHeads: form.headIds,
                          requiresApproval: form.requiresApproval,
                        }),
                  reset,
                )
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {editing ? "Save changes" : "Create concession"}
            </Button>
            <button onClick={reset} className="text-[13px] font-semibold text-ink-3">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <ul className="divide-y divide-line">
        {types.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
            <span className="text-[13.5px] font-medium">{t.name}</span>
            <Badge tone="brand">
              <Percent className="size-3" />
              {t.percentage != null ? `${t.percentage}%` : formatMoney(t.fixedAmount ?? 0)}
            </Badge>
            <span className="text-[12px] text-ink-3">
              off {t.appliesToHeads.length === 0 ? "every head" : t.appliesToHeads.map(headName).join(", ")}
              {` · ${t.students} ${t.students === 1 ? "child" : "children"}`}
              {t.requiresApproval ? "" : " · granted without approval"}
            </span>

            <span className="ml-auto flex items-center gap-2.5">
              <button
                onClick={() => {
                  setEditing(t.id);
                  setOpen(true);
                  setForm({
                    name: t.name,
                    kind: t.percentage != null ? "PERCENT" : "AMOUNT",
                    percentage: t.percentage != null ? String(t.percentage) : "",
                    amount: t.fixedAmount != null ? String(t.fixedAmount / 100) : "",
                    headIds: t.appliesToHeads,
                    requiresApproval: t.requiresApproval,
                  });
                }}
                className="text-[13px] font-semibold text-ink-2 hover:text-brand"
              >
                Edit
              </button>
              <button
                onClick={() =>
                  t.removable ? run(() => deleteConcessionType({ concessionTypeId: t.id })) : setError(t.whyNot)
                }
                title={t.whyNot ?? `Remove ${t.name}`}
                className={t.removable ? "text-overdue hover:text-overdue/80" : "text-ink-3"}
              >
                {t.removable ? <Trash2 className="size-3.5" /> : <X className="size-3.5" />}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Granted, not yet approved — and therefore not yet coming off anybody's invoice. */
export function PendingApprovals({ pendingRows }: { pendingRows: PendingRow[] }) {
  const { pending, error, run } = useRunner();
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  return (
    <Card>
      <CardHead
        title="Waiting for approval"
        hint="An unapproved concession changes nothing — the next invoice is raised at the full fee until somebody says yes."
      />
      <Err text={error} />
      {pendingRows.length === 0 ? (
        <p className="px-5 py-5 text-[13.5px] text-ink-3">Nothing waiting.</p>
      ) : (
        <ul className="divide-y divide-line">
          {pendingRows.map((p) => (
            <li key={p.concessionId} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[13.5px] font-medium">{p.studentName}</span>
                <span className="font-mono text-[11.5px] text-ink-3">{p.admissionNumber}</span>
                <span className="text-[12.5px] text-ink-2">
                  {p.typeName} · {p.worth}
                </span>
                <span className="ml-auto flex items-center gap-2.5">
                  <Button size="sm" disabled={pending} onClick={() => run(() => approveConcession({ concessionId: p.concessionId }))}>
                    Approve
                  </Button>
                  <button
                    onClick={() => {
                      setReasonFor(reasonFor === p.concessionId ? null : p.concessionId);
                      setReason("");
                    }}
                    className="text-[13px] font-semibold text-ink-3 hover:text-overdue"
                  >
                    Decline
                  </button>
                </span>
              </div>
              {p.note ? <p className="mt-1 text-[12px] text-ink-3">{p.note}</p> : null}
              {reasonFor === p.concessionId ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why — the family will ask"
                    className={`${INPUT} max-w-[320px]`}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    disabled={pending || !reason.trim()}
                    onClick={() =>
                      run(() => revokeConcession({ concessionId: p.concessionId, reason }), () => setReasonFor(null))
                    }
                  >
                    Decline it
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** What the school charges for paying late, with what it would actually charge. */
export function FinePolicyCard({ policy }: { policy: FinePolicy | null }) {
  const { pending, error, run } = useRunner();
  const [form, setForm] = useState({
    graceDays: String(policy?.graceDays ?? 7),
    flat: policy?.flatAmount ? String(policy.flatAmount / 100) : "",
    perDay: policy?.perDayAmount ? String(policy.perDayAmount / 100) : "",
    max: policy?.maxAmount != null ? String(policy.maxAmount / 100) : "",
    isActive: policy?.isActive ?? true,
  });
  const [saved, setSaved] = useState(false);

  const grace = Number(form.graceDays) || 0;
  const flat = paiseFromText(form.flat) ?? 0;
  const perDay = paiseFromText(form.perDay) ?? 0;
  const max = form.max.trim() === "" ? null : paiseFromText(form.max);

  const live = validateFinePolicy({
    graceDays: grace,
    flatAmountPaise: flat,
    perDayAmountPaise: perDay,
    maxAmountPaise: max,
  });

  // The same arithmetic the counter uses, on a real unpaid term fee, so a school sees
  // the consequence rather than the rule.
  const example = (days: number) =>
    fineAfterDays({
      daysLate: days,
      graceDays: grace,
      flatAmountPaise: flat,
      perDayAmountPaise: perDay,
      maxAmountPaise: max,
      outstandingPaise: 1370000,
    });

  return (
    <Card>
      <CardHead
        title="Late fee"
        hint="Never applied on its own — the counter has to tick it, and it can never exceed the amount owed."
      />
      <Err text={error} />
      <div className="space-y-3.5 px-5 py-4">
        <label className="flex items-center gap-2 text-[13.5px] font-semibold">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="size-3.5 accent-[var(--color-brand)]"
          />
          Charge something for paying late
        </label>

        {form.isActive ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-[13px] font-semibold">Days of grace</span>
                <input
                  value={form.graceDays}
                  onChange={(e) => setForm({ ...form, graceDays: e.target.value.replace(/\D/g, "") })}
                  inputMode="numeric"
                  className={INPUT}
                />
              </label>
              <label>
                <span className="mb-1.5 block text-[13px] font-semibold">Flat charge</span>
                <input value={form.flat} onChange={(e) => setForm({ ...form, flat: e.target.value })} inputMode="decimal" placeholder="100" className={INPUT} />
              </label>
              <label>
                <span className="mb-1.5 block text-[13px] font-semibold">Per day after that</span>
                <input value={form.perDay} onChange={(e) => setForm({ ...form, perDay: e.target.value })} inputMode="decimal" placeholder="5" className={INPUT} />
              </label>
              <label>
                <span className="mb-1.5 block text-[13px] font-semibold">Never more than</span>
                <input value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} inputMode="decimal" placeholder="no cap" className={INPUT} />
              </label>
            </div>

            <div className="rounded-md border border-line bg-paper-2/60 px-3.5 py-3">
              <p className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
                On a ₹13,700 term fee
              </p>
              <dl className="mt-1.5 space-y-0.5 text-[13px]">
                {[7, 30, 90, 365].map((d) => (
                  <div key={d} className="flex justify-between gap-3">
                    <dt className="text-ink-3">{d} days late</dt>
                    <dd className="font-medium tabular-nums">{formatMoney(example(d))}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-2">
            Nothing extra is charged, whenever a family pays.
          </p>
        )}

        <Messages list={live.messages} />

        <div className="flex items-center gap-3">
          <Button
            disabled={pending || !live.ok}
            onClick={() => {
              setSaved(false);
              run(
                () =>
                  saveFinePolicy({
                    graceDays: grace,
                    flatAmountText: form.flat,
                    perDayAmountText: form.perDay,
                    maxAmountText: form.max,
                    isActive: form.isActive,
                  }),
                () => setSaved(true),
              );
            }}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save policy
          </Button>
          {saved ? <span className="text-[13px] font-medium text-good">Saved.</span> : null}
        </div>
      </div>
    </Card>
  );
}
