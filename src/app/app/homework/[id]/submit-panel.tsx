"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/components/ui/primitives";
import { submitHomework } from "../actions";

export type MySubmission = {
  submittedAt: string;
  note: string | null;
  fileUrl: string | null;
  marks: number | null;
  feedback: string | null;
};

/**
 * A student's own view of one homework: hand it in, or see what was handed in
 * and, once a teacher has looked at it, the mark and note. No resubmission —
 * once this exists, the form is gone for good.
 */
export function SubmitPanel({
  homeworkId,
  maxMarks,
  mine,
  canSubmit,
  whyNot,
}: {
  homeworkId: string;
  maxMarks: number | null;
  mine: MySubmission | null;
  canSubmit: boolean;
  whyNot: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [fileUrl, setFileUrl] = useState("");

  if (mine) {
    return (
      <Card>
        <CardHead
          title="What you handed in"
          action={
            mine.marks != null ? (
              <Badge tone="good">
                <CheckCircle2 className="size-3" /> {mine.marks}
                {maxMarks ? `/${maxMarks}` : ""}
              </Badge>
            ) : (
              <Badge tone="warn">Waiting for your teacher</Badge>
            )
          }
        />
        <div className="px-5 py-4 text-[13.5px]">
          <p className="text-ink-3">
            Submitted {new Date(mine.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
          {mine.note ? <p className="mt-2 leading-snug text-ink-2">{mine.note}</p> : null}
          {mine.fileUrl ? (
            <a href={mine.fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-medium text-brand underline">
              Your attachment
            </a>
          ) : null}
          {mine.feedback ? (
            <p className="mt-3 rounded-md border border-line-2 bg-paper-2 px-3 py-2 text-ink-2">
              <span className="font-semibold">Teacher's note: </span>
              {mine.feedback}
            </p>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHead title="Hand it in" hint={maxMarks ? `Out of ${maxMarks} marks` : undefined} />
      {!canSubmit ? (
        <p className="px-5 py-4 text-[13.5px] text-ink-3">{whyNot}</p>
      ) : (
        <div className="px-5 py-4">
          {error ? <p className="mb-3 text-[13px] text-overdue">{error}</p> : null}
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold">Write your answer</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Type your answer, or describe what you are attaching."
              className="w-full rounded-md border border-line-2 bg-white px-2.5 py-2 text-[14px] outline-none focus:border-brand"
            />
          </label>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-[13px] font-semibold">Or attach a link to a photo (optional)</span>
            <input
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="https://…"
              className="h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
            />
          </label>
          <Button
            className="mt-3"
            size="sm"
            disabled={pending || (!note.trim() && !fileUrl.trim())}
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await submitHomework({ homeworkId, note: note.trim() || null, fileUrl: fileUrl.trim() || null });
                if (r?.error) {
                  setError(r.error);
                  return;
                }
                router.refresh();
              });
            }}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Hand it in
          </Button>
        </div>
      )}
    </Card>
  );
}
