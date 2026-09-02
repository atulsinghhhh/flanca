"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Copy, KeyRound, Loader2, Pencil, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { resetStaffPassword, setStaffActive } from "./people-actions";

/**
 * What the office can do to somebody's record from their own page.
 *
 * Two of the three are consequential enough to ask first: a reset locks the person
 * out of the password they know, and marking somebody as left takes their roles away
 * with them.
 */
export function StaffActions({
  staffId,
  name,
  isActive,
}: {
  staffId: string;
  name: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<"RESET" | "LEAVE" | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/app/staff/${staffId}/edit`}
          className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand"
        >
          <Pencil className="size-3.5" /> Edit
        </Link>
        <button
          onClick={() => {
            setError(null);
            setIssued(null);
            setAsking(asking === "RESET" ? null : "RESET");
          }}
          className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand"
        >
          <KeyRound className="size-3.5" /> New password
        </button>
        {isActive ? (
          <button
            onClick={() => {
              setError(null);
              setAsking(asking === "LEAVE" ? null : "LEAVE");
            }}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-overdue hover:text-overdue"
          >
            <UserMinus className="size-3.5" /> Mark as left
          </button>
        ) : (
          <button
            onClick={() =>
              start(async () => {
                const r = await setStaffActive({ staffId, isActive: true });
                if (r.error) setError(r.error);
                else router.refresh();
              })
            }
            disabled={pending}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand"
          >
            <UserPlus className="size-3.5" /> Back on staff
          </button>
        )}
      </div>

      {error ? (
        <p className="mt-2.5 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13px] text-overdue">
          {error}
        </p>
      ) : null}

      {issued ? (
        <div className="mt-2.5 rounded-lg border border-brand/30 bg-brand-light/50 px-4 py-3">
          <p className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
            New password for {name}
          </p>
          <p className="mt-1 font-mono text-[19px] font-semibold tracking-wide">{issued}</p>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(issued);
              setCopied(true);
            }}
            className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
          </button>
          <p className="mt-1.5 text-[12px] leading-snug text-ink-2">
            Shown once. Their old password no longer works.
          </p>
        </div>
      ) : null}

      {asking === "RESET" ? (
        <Ask
          title={`Give ${name} a new password?`}
          body="The password they use now will stop working immediately. You will be shown the new one once, to pass on."
          confirmLabel="Yes, reset it"
          pending={pending}
          onCancel={() => setAsking(null)}
          onConfirm={() =>
            start(async () => {
              const r = await resetStaffPassword({ staffId });
              setAsking(null);
              if (r.error) setError(r.error);
              else setIssued(r.firstPassword ?? null);
            })
          }
        />
      ) : null}

      {asking === "LEAVE" ? (
        <Ask
          title={`Mark ${name} as having left?`}
          body="Their roles at this school go with them, so they will not be able to open anything here. The record stays, along with everything they marked, entered or collected."
          confirmLabel="Yes, they have left"
          pending={pending}
          onCancel={() => setAsking(null)}
          onConfirm={() =>
            start(async () => {
              const r = await setStaffActive({ staffId, isActive: false });
              setAsking(null);
              if (r.error) setError(r.error);
              else router.refresh();
            })
          }
        />
      ) : null}
    </div>
  );
}

function Ask({
  title,
  body,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2.5 rounded-lg border border-marigold/35 bg-marigold-light/60 px-4 py-3">
      <p className="text-[13.5px] font-semibold">{title}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{body}</p>
      <div className="mt-2.5 flex items-center gap-3">
        <Button size="sm" disabled={pending} onClick={onConfirm}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null} {confirmLabel}
        </Button>
        <button onClick={onCancel} className="text-[13px] font-semibold text-ink-3">
          Not now
        </button>
      </div>
    </div>
  );
}
