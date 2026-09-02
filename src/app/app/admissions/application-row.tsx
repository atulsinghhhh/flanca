"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Phone, UserPlus } from "lucide-react";
import type { ApplicationStatus } from "@prisma/client";
import { Badge, Button } from "@/components/ui/primitives";
import { enrolApplicant, updateApplication } from "./actions";

const STATUSES: Array<{ value: ApplicationStatus; label: string }> = [
  { value: "SUBMITTED", label: "Received" },
  { value: "UNDER_REVIEW", label: "Being read" },
  { value: "DOCUMENTS_PENDING", label: "Papers needed" },
  { value: "SHORTLISTED", label: "Shortlisted" },
  { value: "OFFERED", label: "Seat offered" },
  { value: "REJECTED", label: "Not offered" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];

const TONE: Record<string, "neutral" | "info" | "warn" | "good" | "bad" | "brand"> = {
  SUBMITTED: "neutral",
  UNDER_REVIEW: "info",
  DOCUMENTS_PENDING: "warn",
  SHORTLISTED: "brand",
  OFFERED: "good",
  ENROLLED: "good",
  REJECTED: "bad",
  WITHDRAWN: "neutral",
};

export type AppRow = {
  id: string;
  applicationNo: string;
  studentName: string;
  classSought: string | null;
  parentName: string;
  phone: string;
  status: string;
  previousSchool: string | null;
  documentsNote: string | null;
  reviewNote: string | null;
  submittedAt: string;
  enrolled: boolean;
};

export function ApplicationRow({
  row,
  classes,
}: {
  row: AppRow;
  classes: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(row.status);
  const [note, setNote] = useState(row.documentsNote ?? "");
  const [reviewNote, setReviewNote] = useState(row.reviewNote ?? "");
  const [classId, setClassId] = useState(
    classes.find((c) => c.name === row.classSought)?.id ?? "",
  );
  const [message, setMessage] = useState<string | null>(null);

  function save() {
    setMessage(null);
    start(async () => {
      const r = await updateApplication({
        id: row.id,
        status: status as ApplicationStatus,
        documentsNote: note,
        reviewNote,
      });
      if (r.error) {
        setMessage(r.error);
        return;
      }
      setMessage("Updated — the parent sees this on their tracking page.");
      router.refresh();
    });
  }

  function enrol() {
    setMessage(null);
    start(async () => {
      const r = await enrolApplicant({ id: row.id, classId });
      if (r.error) {
        setMessage(r.error);
        return;
      }
      setMessage(`Admitted as ${r.admissionNumber}.`);
      router.refresh();
    });
  }

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-left text-[14.5px] font-semibold hover:text-brand"
          >
            {row.studentName}
          </button>
          <p className="mt-0.5 text-[12px] text-ink-3">
            <span className="font-mono">{row.applicationNo}</span> · {row.classSought ?? "—"} ·{" "}
            {row.parentName}
            {row.previousSchool ? ` · from ${row.previousSchool}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <a
            href={`tel:${row.phone}`}
            className="inline-flex items-center gap-1 font-mono text-[12px] text-ink-3 hover:text-brand"
          >
            <Phone className="size-3" /> {row.phone}
          </a>
          <Badge tone={TONE[row.status] ?? "neutral"}>
            {STATUSES.find((s) => s.value === row.status)?.label ?? row.status}
          </Badge>
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-[13px] font-semibold text-brand hover:underline"
          >
            {open ? "Close" : "Open"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 rounded-md border border-line bg-paper-2/50 px-4 py-3">
          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <label className="eyebrow text-ink-3 mb-1 block">Where has it reached?</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={row.enrolled}
                className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand disabled:opacity-60"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[220px] flex-1">
              <label className="eyebrow text-ink-3 mb-1 block">Note for the parent (they see this)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Bring the birth certificate and last report card"
                className="h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
              />
            </div>

            <Button size="sm" variant="secondary" onClick={save} disabled={pending || row.enrolled}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Save
            </Button>
          </div>

          <div>
            <label className="eyebrow text-ink-3 mb-1 block">
              Reason shown to the parent if this is rejected or withdrawn
            </label>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={2}
              placeholder="No seats left in the class applied for this year"
              className="w-full rounded-md border border-line-2 bg-white px-2.5 py-1.5 text-[13.5px] outline-none focus:border-brand"
            />
          </div>

          {!row.enrolled ? (
            <div className="flex flex-wrap items-end gap-2.5 border-t border-line pt-3">
              <div>
                <label className="eyebrow text-ink-3 mb-1 block">Admit into</label>
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[13.5px] outline-none focus:border-brand"
                >
                  <option value="">Choose a class…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button size="sm" onClick={enrol} disabled={pending || !classId}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                Admit and put on the roll
              </Button>
              <p className="text-[11.5px] text-ink-3">
                Issues an admission number and copies the form across — nothing is re-typed.
              </p>
            </div>
          ) : null}

          {message ? <p className="text-[12.5px] text-good">{message}</p> : null}
        </div>
      ) : null}
    </li>
  );
}
