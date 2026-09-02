"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, TriangleAlert } from "lucide-react";
import { Button, Card, CardHead } from "@/components/ui/primitives";
import { resetLogin, type Slip } from "../logins/actions";

/**
 * Reset one child's login from their own profile — the natural place for it,
 * since the office is already looking at this child and not a whole class.
 * Mirrors the "shown once" pattern from bulk issuing: the code lives in this
 * component's state only, never in the audit trail.
 */
export function LoginReset({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slip, setSlip] = useState<Slip | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setError(null);
    start(async () => {
      const r = await resetLogin(studentId);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setSlip(r.slip);
      setConfirming(false);
      router.refresh();
    });
  }

  if (slip) {
    return (
      <Card>
        <CardHead
          title="New login code"
          hint="Shown once, here, and nowhere else again — hand it to the child now."
        />
        <div className="space-y-3 px-5 py-4">
          <div className="rounded-lg border border-brand/30 bg-brand-light/50 px-4 py-4">
            <p className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">One-time code</p>
            <p className="mt-1.5 font-mono text-[20px] font-semibold tracking-wide tabular-nums">
              {slip.code}
            </p>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(slip.code);
                setCopied(true);
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="font-mono text-[12.5px] text-ink-3">{slip.email}</p>
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-marigold" />
            The child must change it the next time they sign in.
          </p>
          <Button size="sm" variant="ghost" onClick={() => setSlip(null)}>
            Done
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHead
        title="Student login"
        hint="Resetting replaces the current code — the old one stops working immediately."
        action={
          confirming ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={pending} onClick={reset}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                Confirm reset
              </Button>
              <button
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="text-[12.5px] font-semibold text-ink-3 hover:text-ink"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
              <KeyRound className="size-4" /> Reset login
            </Button>
          )
        }
      />
      {error ? (
        <p className="border-t border-line bg-overdue-light px-5 py-3 text-[13.5px] text-overdue">{error}</p>
      ) : null}
    </Card>
  );
}
