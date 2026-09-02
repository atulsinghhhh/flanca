"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/components/ui/primitives";
import {
  createClass, createSection, deleteClass, deleteSection, renameClass, setClassTeacher,
} from "./actions";

export type TeacherOption = { userId: string; name: string; designation: string | null };

export type SectionRow = {
  id: string;
  name: string;
  students: number;
  classTeacherId: string | null;
  classTeacherName: string | null;
  removable: boolean;
  whyNot: string | null;
};

export type ClassRow = {
  id: string;
  name: string;
  students: number;
  subjects: number;
  sections: SectionRow[];
  removable: boolean;
  whyNot: string | null;
};

const INPUT = "h-9 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

/**
 * The school's own shape, edited in place.
 *
 * Everything here refuses rather than cascades: a section with a child in it says
 * how many, and stays. The office should never be able to make a report card
 * homeless by tidying up.
 */
export function ClassEditor({ classes, teachers }: { classes: ClassRow[]; teachers: TeacherOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newClass, setNewClass] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newSection, setNewSection] = useState("");

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
    <>
      {error ? (
        <p className="mt-4 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13.5px] text-overdue">
          {error}
        </p>
      ) : null}

      <Card className="mt-5">
        <CardHead
          title="Classes"
          hint="Nursery to Class 12 — the order is worked out from the name, so a dropdown never reads Class 10 before Class 2."
        />

        <div className="flex flex-wrap items-end gap-2 border-b border-line px-5 py-4">
          <label className="flex-1">
            <span className="mb-1.5 block text-[13px] font-semibold">Add a class</span>
            <input
              value={newClass}
              onChange={(e) => setNewClass(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newClass.trim()) {
                  run(() => createClass({ name: newClass }), () => setNewClass(""));
                }
              }}
              placeholder="9, or Nursery, or LKG"
              className={`${INPUT} w-full`}
            />
          </label>
          <Button
            size="sm"
            disabled={pending || !newClass.trim()}
            onClick={() => run(() => createClass({ name: newClass }), () => setNewClass(""))}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
          </Button>
        </div>

        {classes.length === 0 ? (
          <p className="px-5 py-6 text-center text-[14px] text-ink-3">
            No classes yet. Add the first one above, or import your register and they will be created for you.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {classes.map((cls) => (
              <li key={cls.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  {renaming === cls.id ? (
                    <>
                      <input
                        value={renameTo}
                        onChange={(e) => setRenameTo(e.target.value)}
                        className={`${INPUT} w-40`}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(() => renameClass({ classId: cls.id, name: renameTo }), () => setRenaming(null))
                        }
                      >
                        <Check className="size-3.5" /> Save
                      </Button>
                      <button
                        onClick={() => setRenaming(null)}
                        className="text-[13px] font-semibold text-ink-3 hover:text-ink"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="font-display text-[16px] font-semibold">{cls.name}</span>
                      <Badge tone="neutral">
                        {cls.students} {cls.students === 1 ? "child" : "children"}
                      </Badge>
                      {cls.subjects > 0 ? <Badge tone="neutral">{cls.subjects} subjects</Badge> : null}

                      <span className="ml-auto flex items-center gap-2">
                        <button
                          onClick={() => {
                            setRenaming(cls.id);
                            setRenameTo(cls.name);
                          }}
                          className="flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-brand"
                        >
                          <Pencil className="size-3.5" /> Rename
                        </button>
                        <button
                          onClick={() => setAddingTo(addingTo === cls.id ? null : cls.id)}
                          className="flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-brand"
                        >
                          <Plus className="size-3.5" /> Section
                        </button>
                        <button
                          onClick={() =>
                            cls.removable ? run(() => deleteClass({ classId: cls.id })) : setError(cls.whyNot)
                          }
                          title={cls.whyNot ?? "Remove this class"}
                          className={`flex items-center gap-1 text-[13px] font-semibold ${
                            cls.removable ? "text-overdue hover:text-overdue/80" : "text-ink-3"
                          }`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </span>
                    </>
                  )}
                </div>

                {addingTo === cls.id ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-line bg-paper-2/50 px-3 py-2.5">
                    <label>
                      <span className="mb-1 block text-[12.5px] font-semibold">New section in {cls.name}</span>
                      <input
                        value={newSection}
                        onChange={(e) => setNewSection(e.target.value)}
                        placeholder="A"
                        className={`${INPUT} w-24`}
                        autoFocus
                      />
                    </label>
                    <Button
                      size="sm"
                      disabled={pending || !newSection.trim()}
                      onClick={() =>
                        run(() => createSection({ classId: cls.id, name: newSection }), () => {
                          setNewSection("");
                          setAddingTo(null);
                        })
                      }
                    >
                      Add section
                    </Button>
                    <button onClick={() => setAddingTo(null)} className="text-[13px] font-semibold text-ink-3">
                      Cancel
                    </button>
                  </div>
                ) : null}

                {cls.sections.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {cls.sections.map((s) => (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-white px-3 py-2.5"
                      >
                        <span className="w-8 text-[14px] font-semibold">{s.name}</span>
                        <span className="text-[12.5px] text-ink-3">
                          {s.students} {s.students === 1 ? "child" : "children"}
                        </span>

                        <label className="ml-auto flex items-center gap-2">
                          <UserRound className="size-3.5 text-ink-3" />
                          <span className="text-[12.5px] text-ink-3">Class teacher</span>
                          <select
                            value={s.classTeacherId ?? ""}
                            disabled={pending}
                            onChange={(e) =>
                              run(() => setClassTeacher({ sectionId: s.id, userId: e.target.value || null }))
                            }
                            className={`${INPUT} max-w-[220px]`}
                          >
                            <option value="">Nobody yet</option>
                            {teachers.map((t) => (
                              <option key={t.userId} value={t.userId}>
                                {t.name}
                                {t.designation ? ` · ${t.designation}` : ""}
                              </option>
                            ))}
                          </select>
                        </label>

                        <button
                          onClick={() =>
                            s.removable ? run(() => deleteSection({ sectionId: s.id })) : setError(s.whyNot)
                          }
                          title={s.whyNot ?? "Remove this section"}
                          className={s.removable ? "text-overdue hover:text-overdue/80" : "text-ink-3"}
                        >
                          {s.removable ? <Trash2 className="size-3.5" /> : <X className="size-3.5" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[12.5px] text-ink-3">
                    No sections. A class can hold children without one, but attendance is marked per section.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
