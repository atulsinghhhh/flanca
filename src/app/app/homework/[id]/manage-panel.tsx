"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Lock, Pencil, Send, X } from "lucide-react";
import { Badge, Button, Card, CardHead, Empty } from "@/components/ui/primitives";
import { closeHomework, gradeSubmission, publishHomework, updateHomework } from "../actions";

const INPUT = "h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

export type RosterRow = {
  studentId: string;
  name: string;
  admissionNumber: string;
  submissionId: string | null;
  submittedAt: string | null;
  note: string | null;
  fileUrl: string | null;
  marks: number | null;
  feedback: string | null;
};

/**
 * The office/teacher side of one homework: publish or close it, and grade what
 * has been handed in. There is no AI score to accept here — a mark only ever
 * comes from typing it in, and typing it again corrects it.
 */
export function ManagePanel({
  homeworkId,
  status,
  title,
  details,
  dueIso,
  maxMarks,
  roster,
}: {
  homeworkId: string;
  status: "DRAFT" | "ASSIGNED" | "CLOSED";
  title: string;
  details: string | null;
  dueIso: string | null;
  maxMarks: number | null;
  roster: RosterRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [editDetails, setEditDetails] = useState(details ?? "");
  const [editDueIso, setEditDueIso] = useState(dueIso ?? "");

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

  function saveEdit() {
    run(
      () =>
        updateHomework({
          homeworkId,
          title: editTitle,
          details: editDetails,
          dueIso: editDueIso || null,
        }),
      () => setEditing(false),
    );
  }

  function cancelEdit() {
    setError(null);
    setEditTitle(title);
    setEditDetails(details ?? "");
    setEditDueIso(dueIso ?? "");
    setEditing(false);
  }

  const submitted = roster.filter((r) => r.submissionId);
  const graded = roster.filter((r) => r.marks != null);

  return (
    <>
      <Card>
        <CardHead
          title="Status"
          hint={
            status === "DRAFT"
              ? "Only you can see this. Nothing has been sent to students yet."
              : status === "ASSIGNED"
                ? "Live — students in this section can hand in work."
                : "Closed — no longer taking submissions."
          }
          action={
            <div className="flex items-center gap-2">
              <Badge tone={status === "DRAFT" ? "neutral" : status === "ASSIGNED" ? "good" : "bad"}>
                {status}
              </Badge>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => (editing ? cancelEdit() : setEditing(true))}>
                {editing ? <X className="size-4" /> : <Pencil className="size-4" />} {editing ? "Cancel" : "Edit"}
              </Button>
              {status === "DRAFT" ? (
                <Button size="sm" disabled={pending} onClick={() => run(() => publishHomework({ homeworkId }))}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Publish
                </Button>
              ) : null}
              {status === "ASSIGNED" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => run(() => closeHomework({ homeworkId }))}
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Close
                </Button>
              ) : null}
            </div>
          }
        />
        {error ? (
          <p className="mx-5 mt-4 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13.5px] text-overdue">
            {error}
          </p>
        ) : null}
        {editing ? (
          <div className="border-b border-line px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-[13px] font-semibold">What is set</span>
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={INPUT} />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-[13px] font-semibold">Anything more (optional)</span>
                <textarea
                  value={editDetails}
                  onChange={(e) => setEditDetails(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-line-2 bg-white px-2.5 py-2 text-[14px] outline-none focus:border-brand"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-[13px] font-semibold">Due</span>
                <input type="date" value={editDueIso} onChange={(e) => setEditDueIso(e.target.value)} className={INPUT} />
              </label>
            </div>
            <div className="mt-3">
              <Button size="sm" disabled={pending || !editTitle.trim()} onClick={saveEdit}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null} Save changes
              </Button>
            </div>
          </div>
        ) : null}
        <p className="px-5 py-3 text-[13px] text-ink-3">
          {submitted.length} of {roster.length} handed in · {graded.length} graded
        </p>
      </Card>

      <Card className="mt-5 overflow-hidden">
        <CardHead title="Collect and grade" hint="One mark and note per child, entered by hand." />
        {roster.length === 0 ? (
          <Empty title="No students in this section" />
        ) : (
          <ul className="divide-y divide-line">
            {roster.map((r) => (
              <RosterRowItem key={r.studentId} row={r} maxMarks={maxMarks} onDone={() => router.refresh()} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function RosterRowItem({
  row,
  maxMarks,
  onDone,
}: {
  row: RosterRow;
  maxMarks: number | null;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState(row.marks != null ? String(row.marks) : "");
  const [feedback, setFeedback] = useState(row.feedback ?? "");

  if (!row.submissionId) {
    return (
      <li className="flex items-center justify-between gap-3 px-5 py-2.5">
        <div>
          <p className="text-[13.5px] font-medium">{row.name}</p>
          <p className="text-[11.5px] text-ink-3">{row.admissionNumber}</p>
        </div>
        <Badge tone="neutral">Not handed in</Badge>
      </li>
    );
  }

  function save() {
    setError(null);
    const parsed = marks.trim() === "" ? null : Number(marks);
    if (marks.trim() !== "" && !Number.isFinite(parsed)) {
      setError("Marks must be a number.");
      return;
    }
    start(async () => {
      const r = await gradeSubmission({ submissionId: row.submissionId!, marks: parsed, feedback });
      if (r?.error) {
        setError(r.error);
        return;
      }
      onDone();
    });
  }

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13.5px] font-medium">
            {row.name}
            {row.marks != null ? (
              <Badge tone="good">
                <CheckCircle2 className="size-3" /> Graded
              </Badge>
            ) : (
              <Badge tone="warn">Handed in</Badge>
            )}
          </p>
          <p className="text-[11.5px] text-ink-3">
            {row.admissionNumber} · submitted{" "}
            {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
          </p>
          {row.note ? <p className="mt-1.5 text-[13px] leading-snug text-ink-2">{row.note}</p> : null}
          {row.fileUrl ? (
            <a href={row.fileUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12.5px] font-medium text-brand underline">
              View attachment
            </a>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <input
            value={marks}
            onChange={(e) => setMarks(e.target.value)}
            placeholder={maxMarks ? `/ ${maxMarks}` : "marks"}
            className="h-8.5 w-20 rounded-md border border-line-2 bg-white px-2 text-[13px] outline-none focus:border-brand"
          />
          <input
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Note (optional)"
            className="h-8.5 w-40 rounded-md border border-line-2 bg-white px-2 text-[13px] outline-none focus:border-brand"
          />
          <Button size="sm" disabled={pending} onClick={save}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>
      {error ? <p className="mt-1.5 text-[12.5px] text-overdue">{error}</p> : null}
    </li>
  );
}
