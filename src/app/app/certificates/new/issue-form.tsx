"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ScrollText, TriangleAlert } from "lucide-react";
import type { CertificateType } from "@prisma/client";
import { Button } from "@/components/ui/primitives";
import { CERTIFICATE_TYPES, CONDUCT_OPTIONS, LEAVING_REASONS } from "@/lib/core/certificate-core";
import { formatMoney } from "@/lib/core/money";
import { issueCertificate } from "../actions";

export function IssueForm({
  studentId,
  studentName,
  outstanding,
  today,
  defaultType,
}: {
  studentId: string;
  studentName: string;
  outstanding: number;
  today: string;
  defaultType: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState(defaultType);
  const [issuedOn, setIssuedOn] = useState(today);
  const [purpose, setPurpose] = useState("");
  const [conduct, setConduct] = useState<string>("Good");
  const [leavingReason, setLeavingReason] = useState<string>(LEAVING_REASONS[0]);
  const [remarks, setRemarks] = useState("");
  const [markTransferred, setMarkTransferred] = useState(true);

  const isTC = type === "TRANSFER";
  const meta = CERTIFICATE_TYPES.find((t) => t.value === type)!;

  function submit() {
    setError(null);
    start(async () => {
      const r = await issueCertificate({
        studentId,
        type: type as CertificateType,
        issuedOn,
        purpose: purpose || undefined,
        conduct,
        leavingReason: isTC ? leavingReason : undefined,
        remarks: remarks || undefined,
        markTransferred: isTC ? markTransferred : false,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      router.push(`/app/certificates/${r.certificateId}`);
    });
  }

  return (
    <div className="space-y-5 px-5 py-5">
      <div>
        <p className="eyebrow text-ink-3 mb-2">Which certificate?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CERTIFICATE_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`rounded-lg border-2 px-3.5 py-2.5 text-left transition-colors ${
                type === t.value
                  ? "border-brand bg-brand-light"
                  : "border-line bg-white hover:border-line-2 hover:bg-paper-2"
              }`}
            >
              <p className="text-[13.5px] font-semibold">{t.label}</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{t.blurb}</p>
            </button>
          ))}
        </div>
      </div>

      {outstanding > 0 ? (
        <div className="flex items-start gap-2.5 rounded-md border border-marigold/35 bg-marigold-light px-3 py-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-marigold-ink" />
          <p className="text-[12.5px] leading-snug text-marigold-ink-strong">
            <strong>{formatMoney(outstanding)} is still outstanding</strong> for {studentName}. You can
            still issue — the amount is recorded on the certificate's record so it is never a surprise
            later.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="issuedOn" className="eyebrow text-ink-3 mb-1 block">
            Date of issue
          </label>
          <input
            id="issuedOn"
            type="date"
            value={issuedOn}
            onChange={(e) => setIssuedOn(e.target.value)}
            className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor="conduct" className="eyebrow text-ink-3 mb-1 block">
            General conduct
          </label>
          <select
            id="conduct"
            value={conduct}
            onChange={(e) => setConduct(e.target.value)}
            className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
          >
            {CONDUCT_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {isTC ? (
          <div className="sm:col-span-2">
            <label htmlFor="leaving" className="eyebrow text-ink-3 mb-1 block">
              Reason for leaving
            </label>
            <select
              id="leaving"
              value={leavingReason}
              onChange={(e) => setLeavingReason(e.target.value)}
              className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
            >
              {LEAVING_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="sm:col-span-2">
            <label htmlFor="purpose" className="eyebrow text-ink-3 mb-1 block">
              Purpose (printed on the certificate)
            </label>
            <input
              id="purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Passport application, scholarship, bank account…"
              className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="remarks" className="eyebrow text-ink-3 mb-1 block">
            Remarks (optional)
          </label>
          <input
            id="remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="h-10 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
          />
        </div>
      </div>

      {isTC ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line bg-paper-2/60 px-3 py-2.5">
          <input
            type="checkbox"
            checked={markTransferred}
            onChange={(e) => setMarkTransferred(e.target.checked)}
            className="mt-0.5 size-3.5 accent-[var(--color-brand)]"
          />
          <span className="text-[12.5px] leading-snug text-ink-2">
            Take {studentName} off the roll as <strong>transferred</strong>. Untick if the child is
            staying — a TC is sometimes issued for a passport, and the roll must not change by accident.
          </span>
        </label>
      ) : null}

      {error ? (
        <p className="rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13px] text-overdue">
          {error}
        </p>
      ) : null}

      <Button size="lg" onClick={submit} disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ScrollText className="size-4" />}
        {pending ? "Issuing…" : `Issue ${meta.label} for ${studentName}`}
      </Button>
      <p className="text-center text-[12px] text-ink-3">
        A serial number is issued automatically, in an unbroken sequence.
      </p>
    </div>
  );
}
