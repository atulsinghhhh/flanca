"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/components/ui/primitives";
import { createSubject, deleteSubject, setSubjectTeachers, updateSubject } from "./actions";

/** Two people at this school genuinely share a name, so a bare name is not enough to pick by. */
export type TeacherOption = { staffId: string; name: string; label: string };

export type SubjectRow = {
  id: string;
  name: string;
  code: string | null;
  isElective: boolean;
  isCoScholastic: boolean;
  teacherStaffIds: string[];
  teacherNames: string[];
  removable: boolean;
  whyNot: string | null;
};

const INPUT = "h-9 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

export function SubjectEditor({
  classId,
  className,
  subjects,
  teachers,
}: {
  classId: string;
  className: string;
  subjects: SubjectRow[];
  teachers: TeacherOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [coScholastic, setCoScholastic] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; code: string; isElective: boolean; isCoScholastic: boolean }>({
    name: "",
    code: "",
    isElective: false,
    isCoScholastic: false,
  });

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
    <Card className="mt-5">
      <CardHead
        title={`What ${className} is taught`}
        hint="A co-scholastic subject is graded, not marked out of a total — Art, PE and Work Education usually are."
      />

      {error ? (
        <p className="mx-5 mt-4 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13.5px] text-overdue">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 border-b border-line px-5 py-4">
        <label className="min-w-[180px] flex-1">
          <span className="mb-1.5 block text-[13px] font-semibold">Add a subject</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sanskrit"
            className={`${INPUT} w-full`}
          />
        </label>
        <label className="w-28">
          <span className="mb-1.5 block text-[13px] font-semibold">Code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SAN" className={`${INPUT} w-full`} />
        </label>
        <label className="flex h-9 items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={coScholastic}
            onChange={(e) => setCoScholastic(e.target.checked)}
            className="size-3.5 accent-[var(--color-brand)]"
          />
          Co-scholastic
        </label>
        <Button
          size="sm"
          disabled={pending || !name.trim()}
          onClick={() =>
            run(
              () => createSubject({ classId, name, code, isCoScholastic: coScholastic }),
              () => {
                setName("");
                setCode("");
                setCoScholastic(false);
              },
            )
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
        </Button>
      </div>

      {subjects.length === 0 ? (
        <p className="px-5 py-6 text-center text-[14px] text-ink-3">
          {className} has no subjects yet. Add them above — exam papers, the timetable and report cards all
          come from this list.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {subjects.map((s) => (
            <li key={s.id} className="px-5 py-3.5">
              {editing === s.id ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[160px] flex-1">
                    <span className="mb-1 block text-[12.5px] font-semibold">Name</span>
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      className={`${INPUT} w-full`}
                      autoFocus
                    />
                  </label>
                  <label className="w-24">
                    <span className="mb-1 block text-[12.5px] font-semibold">Code</span>
                    <input
                      value={draft.code}
                      onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                      className={`${INPUT} w-full`}
                    />
                  </label>
                  <label className="flex h-9 items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={draft.isElective}
                      onChange={(e) => setDraft({ ...draft, isElective: e.target.checked })}
                      className="size-3.5 accent-[var(--color-brand)]"
                    />
                    Elective
                  </label>
                  <label className="flex h-9 items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={draft.isCoScholastic}
                      onChange={(e) => setDraft({ ...draft, isCoScholastic: e.target.checked })}
                      className="size-3.5 accent-[var(--color-brand)]"
                    />
                    Co-scholastic
                  </label>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => updateSubject({ subjectId: s.id, ...draft }), () => setEditing(null))}
                  >
                    <Check className="size-3.5" /> Save
                  </Button>
                  <button onClick={() => setEditing(null)} className="text-[13px] font-semibold text-ink-3">
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[14.5px] font-semibold">{s.name}</span>
                    {s.code ? <span className="font-mono text-[11.5px] text-ink-3">{s.code}</span> : null}
                    {s.isCoScholastic ? <Badge tone="info">Graded</Badge> : null}
                    {s.isElective ? <Badge tone="neutral">Elective</Badge> : null}

                    <span className="ml-auto flex items-center gap-2.5">
                      <button
                        onClick={() => {
                          setEditing(s.id);
                          setDraft({
                            name: s.name,
                            code: s.code ?? "",
                            isElective: s.isElective,
                            isCoScholastic: s.isCoScholastic,
                          });
                        }}
                        className="flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-brand"
                      >
                        <Pencil className="size-3.5" /> Edit
                      </button>
                      <button
                        onClick={() =>
                          s.removable ? run(() => deleteSubject({ subjectId: s.id })) : setError(s.whyNot)
                        }
                        title={s.whyNot ?? "Remove this subject"}
                        className={s.removable ? "text-overdue hover:text-overdue/80" : "text-ink-3"}
                      >
                        {s.removable ? <Trash2 className="size-3.5" /> : <X className="size-3.5" />}
                      </button>
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] text-ink-3">Taught by</span>
                    {s.teacherStaffIds.length === 0 ? (
                      <span className="text-[12.5px] text-marigold">nobody yet</span>
                    ) : (
                      s.teacherNames.map((n, i) => (
                        <span
                          key={s.teacherStaffIds[i]}
                          className="flex items-center gap-1 rounded-full border border-line bg-paper-2/70 px-2 py-0.5 text-[12px]"
                        >
                          {n}
                          <button
                            onClick={() =>
                              run(() =>
                                setSubjectTeachers({
                                  subjectId: s.id,
                                  staffIds: s.teacherStaffIds.filter((id) => id !== s.teacherStaffIds[i]),
                                }),
                              )
                            }
                            className="text-ink-3 hover:text-overdue"
                            aria-label={`Remove ${n}`}
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))
                    )}

                    <select
                      value=""
                      disabled={pending}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        run(() =>
                          setSubjectTeachers({
                            subjectId: s.id,
                            staffIds: [...s.teacherStaffIds, e.target.value],
                          }),
                        );
                      }}
                      className={`${INPUT} max-w-[200px]`}
                    >
                      <option value="">Add a teacher…</option>
                      {teachers
                        .filter((t) => !s.teacherStaffIds.includes(t.staffId))
                        .map((t) => (
                          <option key={t.staffId} value={t.staffId}>
                            {t.label}
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
