"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, LockOpen, PenLine, Pencil, ShieldCheck, Trash2, X } from "lucide-react";
import { Badge, Button, Card, CardHead, Empty, Meter } from "@/components/ui/primitives";
import { formatPercent } from "@/lib/core/grading-core";
import { assignExamDuty, deleteExamPaper, removeExamDuty, unpublishExamTerm, updateExamPaper } from "../../actions";

type ExamRow = {
  id: string;
  subjectName: string;
  examDate: Date | null;
  maxMarks: number;
  passMarks: number;
  roomNo: string | null;
  entered: number;
  expected: number;
  duties: Array<{ staffId: string; staffName: string }>;
};

type Teacher = { staffId: string; name: string };

type ClassRow = {
  termId: string;
  classId: string | null;
  className: string;
  strength: number;
  resultDate: Date | null;
  isPublished: boolean;
  exams: ExamRow[];
};

function toDateInput(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

/** One class's papers for a term — with edit, delete and unpublish for the office. */
export function TermClassCard({ c, canManage, teachers = [] }: { c: ClassRow; canManage: boolean; teachers?: Teacher[] }) {
  const router = useRouter();
  const entered = c.exams.reduce((a, e) => a + e.entered, 0);
  const expected = c.exams.reduce((a, e) => a + e.expected, 0);
  const progressBp = expected > 0 ? Math.round((entered / expected) * 10000) : 0;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ examDateIso: "", maxMarks: "", passMarks: "", roomNo: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [unpublishing, startUnpublish] = useTransition();
  const [dutyPending, startDuty] = useTransition();

  function beginEdit(e: ExamRow) {
    setError(null);
    setEditingId(e.id);
    setDraft({
      examDateIso: toDateInput(e.examDate),
      maxMarks: String(e.maxMarks),
      passMarks: String(e.passMarks),
      roomNo: e.roomNo ?? "",
    });
  }

  function assignDuty(examId: string, staffId: string) {
    if (!staffId) return;
    setError(null);
    startDuty(async () => {
      const r = await assignExamDuty({ examId, staffId });
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function unassignDuty(examId: string, staffId: string) {
    setError(null);
    startDuty(async () => {
      const r = await removeExamDuty({ examId, staffId });
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  function saveEdit(examId: string) {
    setError(null);
    start(async () => {
      const r = await updateExamPaper({
        examId,
        examDateIso: draft.examDateIso || undefined,
        maxMarks: draft.maxMarks ? Number(draft.maxMarks) : undefined,
        passMarks: draft.passMarks ? Number(draft.passMarks) : undefined,
        roomNo: draft.roomNo.trim() || null,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function removePaper(examId: string) {
    if (!window.confirm("Remove this paper? This cannot be undone.")) return;
    setError(null);
    start(async () => {
      const r = await deleteExamPaper({ examId });
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function unpublish() {
    if (!window.confirm(`Unpublish ${c.className}? Marks will be unlocked for correction.`)) return;
    setError(null);
    startUnpublish(async () => {
      const r = await unpublishExamTerm(c.termId);
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHead
        title={c.className}
        hint={`${c.strength} students · ${c.exams.length} papers`}
        action={
          <div className="flex items-center gap-3">
            <div className="w-36">
              <Meter
                valueBp={progressBp}
                tone={progressBp >= 10000 ? "good" : progressBp > 0 ? "warn" : "neutral"}
              />
            </div>
            <Badge tone={c.isPublished ? "good" : progressBp >= 10000 ? "brand" : "warn"}>
              {c.isPublished ? "Published" : `${formatPercent(progressBp, 0)} entered`}
            </Badge>
            {canManage && c.isPublished ? (
              <Button size="sm" variant="secondary" onClick={unpublish} disabled={unpublishing}>
                {unpublishing ? <Loader2 className="size-3.5 animate-spin" /> : <LockOpen className="size-3.5" />}
                Unpublish
              </Button>
            ) : null}
          </div>
        }
      />
      {error ? <p className="px-5 pt-3 text-[12.5px] text-overdue">{error}</p> : null}
      {c.exams.length === 0 ? (
        <Empty title="No papers in this class" />
      ) : (
        <div className="overflow-x-auto">
          <table className="ruled w-full min-w-[920px]">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Date</th>
                <th>Room</th>
                <th className="num">Max</th>
                <th className="num">Pass</th>
                <th className="num">Entered</th>
                <th>Duty</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {c.exams.map((e) => {
                const done = e.expected > 0 && e.entered >= e.expected;
                const editing = editingId === e.id;
                return (
                  <tr key={e.id}>
                    <td data-title className="font-medium">
                      {e.subjectName}
                    </td>
                    {editing ? (
                      <>
                        <td data-label="Date">
                          <input
                            type="date"
                            value={draft.examDateIso}
                            onChange={(ev) => setDraft((d) => ({ ...d, examDateIso: ev.target.value }))}
                            className="h-8 w-36 rounded-md border border-line-2 bg-white px-2 text-[13px] outline-none focus:border-brand"
                          />
                        </td>
                        <td data-label="Room">
                          <input
                            value={draft.roomNo}
                            onChange={(ev) => setDraft((d) => ({ ...d, roomNo: ev.target.value }))}
                            placeholder="Room no."
                            className="h-8 w-24 rounded-md border border-line-2 bg-white px-2 text-[13px] outline-none focus:border-brand"
                          />
                        </td>
                        <td data-label="Max" className="num">
                          <input
                            inputMode="numeric"
                            value={draft.maxMarks}
                            onChange={(ev) =>
                              setDraft((d) => ({ ...d, maxMarks: ev.target.value.replace(/\D/g, "") }))
                            }
                            className="h-8 w-16 rounded-md border border-line-2 bg-white px-2 text-right text-[13px] tnum outline-none focus:border-brand"
                          />
                        </td>
                        <td data-label="Pass" className="num">
                          <input
                            inputMode="numeric"
                            value={draft.passMarks}
                            onChange={(ev) =>
                              setDraft((d) => ({ ...d, passMarks: ev.target.value.replace(/\D/g, "") }))
                            }
                            className="h-8 w-16 rounded-md border border-line-2 bg-white px-2 text-right text-[13px] tnum outline-none focus:border-brand"
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td data-label="Date" className="whitespace-nowrap text-ink-2">
                          {e.examDate
                            ? e.examDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                            : "—"}
                        </td>
                        <td data-label="Room" className="whitespace-nowrap text-ink-2">{e.roomNo ?? "—"}</td>
                        <td data-label="Max" className="num text-ink-2">{e.maxMarks}</td>
                        <td data-label="Pass" className="num text-ink-2">{e.passMarks}</td>
                      </>
                    )}
                    <td data-label="Entered" className="num">
                      <span className={done ? "font-semibold text-good" : "text-marigold-ink"}>
                        {e.entered}
                      </span>
                      <span className="text-ink-3">/{e.expected}</span>
                    </td>
                    <td data-label="Duty">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {e.duties.map((d) => (
                          <span
                            key={d.staffId}
                            className="inline-flex items-center gap-1 rounded-full bg-paper-2 px-2 py-0.5 text-[12px] text-ink-2"
                          >
                            <ShieldCheck className="size-3 text-brand" /> {d.staffName}
                            {canManage ? (
                              <button
                                type="button"
                                disabled={dutyPending}
                                onClick={() => unassignDuty(e.id, d.staffId)}
                                className="text-ink-3 hover:text-overdue"
                                aria-label={`Remove ${d.staffName} from duty`}
                              >
                                <X className="size-3" />
                              </button>
                            ) : null}
                          </span>
                        ))}
                        {canManage ? (
                          <select
                            defaultValue=""
                            disabled={dutyPending}
                            onChange={(ev) => {
                              assignDuty(e.id, ev.target.value);
                              ev.target.value = "";
                            }}
                            className="h-7 rounded-md border border-line-2 bg-white px-1.5 text-[12px] text-ink-2 outline-none focus:border-brand"
                          >
                            <option value="">+ Assign</option>
                            {teachers
                              .filter((t) => !e.duties.some((d) => d.staffId === t.staffId))
                              .map((t) => (
                                <option key={t.staffId} value={t.staffId}>
                                  {t.name}
                                </option>
                              ))}
                          </select>
                        ) : null}
                      </div>
                    </td>
                    <td data-label="">
                      <div className="flex items-center justify-end gap-3">
                        {editing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => saveEdit(e.id)}
                              disabled={pending}
                              className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline disabled:opacity-50"
                            >
                              {pending ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="size-3.5" />
                              )}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink"
                            >
                              <X className="size-3.5" /> Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <Link
                              href={`/app/exams/${e.id}`}
                              className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
                            >
                              {done ? (
                                <>
                                  <CheckCircle2 className="size-3.5" /> Review
                                </>
                              ) : (
                                <>
                                  <PenLine className="size-3.5" /> Enter marks
                                </>
                              )}
                            </Link>
                            {canManage ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => beginEdit(e)}
                                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-ink"
                                >
                                  <Pencil className="size-3.5" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removePaper(e.id)}
                                  disabled={pending}
                                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-overdue hover:underline disabled:opacity-50"
                                >
                                  <Trash2 className="size-3.5" /> Delete
                                </button>
                              </>
                            ) : null}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
