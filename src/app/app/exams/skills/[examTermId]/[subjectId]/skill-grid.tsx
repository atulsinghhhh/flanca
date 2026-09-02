"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { saveSkillAssessment, type SkillEntry } from "../../../actions";

type Rating = "BEGINNING" | "DEVELOPING" | "PROFICIENT";
const RATINGS: Rating[] = ["BEGINNING", "DEVELOPING", "PROFICIENT"];
const RATING_LABEL: Record<Rating, string> = {
  BEGINNING: "Beginning",
  DEVELOPING: "Developing",
  PROFICIENT: "Proficient",
};

type Row = {
  id: string;
  name: string;
  rollNumber: number | null;
  sectionName: string;
  rating: Rating | null;
};

/** Nursery/LKG/UKG's version of MarksGrid: a rating band per student instead of a number. */
export function SkillGrid({
  examTermId,
  subjectId,
  students,
  locked,
}: {
  examTermId: string;
  subjectId: string;
  students: Row[];
  locked: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, Rating | null>>(() =>
    Object.fromEntries(students.map((s) => [s.id, s.rating])),
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rated = useMemo(() => students.filter((s) => draft[s.id] != null).length, [draft, students]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const entries: SkillEntry[] = students.map((s) => ({ studentId: s.id, rating: draft[s.id] ?? null }));
      const result = await saveSkillAssessment({ examTermId, subjectId, entries });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedAt(new Date());
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="ruled w-full min-w-[560px]">
            <thead>
              <tr>
                <th className="w-14">Roll</th>
                <th>Student</th>
                <th className="w-16">Sec</th>
                <th className="w-64">Rating</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td data-label="Roll" className="num text-ink-3">{s.rollNumber ?? "—"}</td>
                  <td data-title className="font-medium">{s.name}</td>
                  <td data-label="Sec" className="text-ink-3">{s.sectionName || "—"}</td>
                  <td data-label="Rating">
                    <div className="flex gap-1.5">
                      {RATINGS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          disabled={locked}
                          onClick={() => setDraft((d) => ({ ...d, [s.id]: r }))}
                          className={`h-8 flex-1 rounded-md border px-2 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                            draft[s.id] === r
                              ? "border-brand bg-brand-light text-brand-ink"
                              : "border-line-2 bg-white text-ink-2 hover:bg-paper-2"
                          }`}
                        >
                          {RATING_LABEL[r]}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 mt-4 -mx-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <span className="text-[13.5px] font-semibold">
            {rated} of {students.length} rated
          </span>
          <div className="ml-auto flex items-center gap-3">
            {savedAt ? (
              <span className="flex items-center gap-1.5 text-[12.5px] text-good">
                <Check className="size-3.5" /> Saved{" "}
                {savedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
              </span>
            ) : null}
            <Button size="lg" onClick={save} disabled={saving || locked}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {saving ? "Saving…" : "Save ratings"}
            </Button>
          </div>
        </div>
        {locked ? (
          <p className="mt-2 text-[12.5px] text-ink-3">
            This term is published — ratings are locked. Unpublish it to make a correction.
          </p>
        ) : null}
        {error ? <p className="mt-2 text-[12.5px] text-overdue">{error}</p> : null}
      </div>
    </>
  );
}
