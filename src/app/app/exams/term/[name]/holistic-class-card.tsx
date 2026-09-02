"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, LockOpen, PenLine } from "lucide-react";
import { Badge, Button, Card, CardHead, Empty } from "@/components/ui/primitives";
import { unpublishExamTerm } from "../../actions";

type ClassRow = {
  termId: string;
  classId: string | null;
  className: string;
  strength: number;
  isPublished: boolean;
};

type SkillArea = { id: string; name: string; rated: number; expected: number };
type SkillTermDetail = { termId: string; skillAreas: SkillArea[] } | null;

/** Nursery/LKG/UKG's version of TermClassCard: skill areas instead of papers, ratings instead of marks. */
export function HolisticClassCard({ c, skills, canManage }: { c: ClassRow; skills: SkillTermDetail; canManage: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [unpublishing, startUnpublish] = useTransition();

  function unpublish() {
    if (!window.confirm(`Unpublish ${c.className}? Ratings will be unlocked for correction.`)) return;
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

  const areas = skills?.skillAreas ?? [];
  const rated = areas.reduce((a, s) => a + s.rated, 0);
  const expected = areas.reduce((a, s) => a + s.expected, 0);

  return (
    <Card className="overflow-hidden">
      <CardHead
        title={c.className}
        hint={`${c.strength} students · holistic (graded, not examined) · ${areas.length} skill areas`}
        action={
          <div className="flex items-center gap-3">
            <Badge tone={c.isPublished ? "good" : "warn"}>
              {c.isPublished ? "Published" : `${rated}/${expected} rated`}
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
      {areas.length === 0 ? (
        <Empty title="No skill areas for this class" hint="Add subjects to this class first." />
      ) : (
        <ul className="divide-y divide-line">
          {areas.map((a) => {
            const done = a.expected > 0 && a.rated >= a.expected;
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <p className="text-[13.5px] font-medium">{a.name}</p>
                <div className="flex items-center gap-3">
                  <span className={`tnum text-[12.5px] ${done ? "font-semibold text-good" : "text-marigold-ink"}`}>
                    {a.rated}/{a.expected} rated
                  </span>
                  <Link
                    href={`/app/exams/skills/${c.termId}/${a.id}`}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
                  >
                    <PenLine className="size-3.5" /> {done ? "Review" : "Rate"}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
