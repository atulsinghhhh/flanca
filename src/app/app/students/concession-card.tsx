"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Percent, Plus, X } from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/core/money";
import {
  approveConcession, grantConcession, revokeConcession,
} from "@/app/app/fees/concessions/actions";

export type Granted = {
  concessionId: string;
  typeName: string;
  worth: string;
  approved: boolean;
  note: string | null;
};

export type TypeChoice = { id: string; name: string; worth: string; requiresApproval: boolean };

const INPUT = "h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

/**
 * A child's concessions, on the child's own page.
 *
 * Where a clerk actually does this: a father comes to the office about a second child,
 * and the sibling concession is granted while he is standing there. Approval is a
 * separate act, so what gets recorded now does not change an invoice until somebody
 * senior agrees.
 */
export function ConcessionCard({
  studentId,
  granted,
  types,
  canApprove,
}: {
  studentId: string;
  granted: Granted[];
  types: TypeChoice[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [note, setNote] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const available = types.filter((t) => !granted.some((g) => g.typeName === t.name));
  const chosen = types.find((t) => t.id === typeId);

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

  return (
    <Card>
      <CardHead
        title="Concessions"
        hint="Comes off the next invoice raised, as its own line. Invoices already raised keep what they were raised with."
        action={
          available.length > 0 ? (
            <button
              onClick={() => setOpen(!open)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-2 bg-white px-2.5 text-[12.5px] font-semibold text-ink-2 hover:border-brand hover:text-brand"
            >
              {open ? <X className="size-3.5" /> : <Plus className="size-3.5" />} {open ? "Close" : "Give one"}
            </button>
          ) : null
        }
      />

      {error ? (
        <p className="mx-5 mt-4 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13px] text-overdue">
          {error}
        </p>
      ) : null}

      {open ? (
        <div className="border-b border-line px-5 py-3.5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-[12.5px] font-semibold">Which</span>
              <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={INPUT}>
                <option value="">Choose a concession</option>
                {available.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.worth}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[12.5px] font-semibold">Why (optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Elder sister in Class 9 B"
                className={INPUT}
              />
            </label>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
            {chosen
              ? chosen.requiresApproval
                ? canApprove
                  ? "This one needs approving. You can approve it yourself."
                  : "This one needs approving before it comes off anything — it will show as waiting."
                : "This one applies as soon as it is given."
              : "An unapproved concession changes nothing until somebody approves it."}
          </p>
          <div className="mt-2.5 flex items-center gap-3">
            <Button
              size="sm"
              disabled={pending || !typeId}
              onClick={() =>
                run(
                  () => grantConcession({ studentId, concessionTypeId: typeId, note, approveNow: canApprove }),
                  () => {
                    setOpen(false);
                    setTypeId("");
                    setNote("");
                  },
                )
              }
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Give it
            </Button>
          </div>
        </div>
      ) : null}

      {granted.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-ink-3">
          None. This child is charged the full fee for their class.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {granted.map((g) => (
            <li key={g.concessionId} className="px-5 py-2.5">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="text-[13.5px] font-medium">{g.typeName}</span>
                <Badge tone="brand">
                  <Percent className="size-3" />
                  {g.worth}
                </Badge>
                {g.approved ? null : <Badge tone="warn">Waiting for approval</Badge>}
                <span className="ml-auto flex items-center gap-2.5">
                  {!g.approved && canApprove ? (
                    <button
                      onClick={() => run(() => approveConcession({ concessionId: g.concessionId }))}
                      disabled={pending}
                      className="text-[12.5px] font-semibold text-good hover:underline"
                    >
                      Approve
                    </button>
                  ) : null}
                  {canApprove ? (
                    <button
                      onClick={() => {
                        setRevoking(revoking === g.concessionId ? null : g.concessionId);
                        setReason("");
                      }}
                      className="text-[12.5px] font-semibold text-ink-3 hover:text-overdue"
                    >
                      Take away
                    </button>
                  ) : null}
                </span>
              </div>
              {g.note ? <p className="mt-0.5 text-[12px] text-ink-3">{g.note}</p> : null}
              {revoking === g.concessionId ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why — the family will ask"
                    className={`${INPUT} max-w-[280px]`}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    disabled={pending || !reason.trim()}
                    onClick={() =>
                      run(() => revokeConcession({ concessionId: g.concessionId, reason }), () => setRevoking(null))
                    }
                  >
                    Take it away
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
