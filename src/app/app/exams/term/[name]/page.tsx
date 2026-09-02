import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileCheck2 } from "lucide-react";
import { db } from "@/lib/db";
import { hasRole, OFFICE, requireActor } from "@/lib/session";
import { getExamScope, getTermDetail } from "@/lib/queries/exams";
import { getSkillTermDetail } from "@/lib/queries/skill-assessment";
import { ButtonLink, PageHead } from "@/components/ui/primitives";
import { TermClassCard } from "./term-class-card";
import { HolisticClassCard } from "./holistic-class-card";

export const metadata = { title: "Exam term — Flanca" };

export default async function TermPage({ params }: { params: Promise<{ name: string }> }) {
  const actor = await requireActor();
  const { name } = await params;
  const termName = decodeURIComponent(name);

  const canManage = hasRole(actor, ...OFFICE);
  const scope = await getExamScope(actor, canManage);
  const term = await getTermDetail(actor.schoolId, termName, scope);
  if (!term) notFound();

  // Only the office assigns invigilation duty, so only the office needs the
  // staff picker's contents.
  const teachers = canManage
    ? (
        await db.staff.findMany({
          where: { schoolId: actor.schoolId, isActive: true, user: { roles: { some: { schoolId: actor.schoolId, role: "TEACHER" } } } },
          select: { id: true, user: { select: { name: true } } },
          orderBy: { user: { name: "asc" } },
        })
      ).map((t) => ({ staffId: t.id, name: t.user.name }))
    : [];

  return (
    <>
      <Link
        href="/app/exams"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> All exam cycles
      </Link>

      <PageHead
        eyebrow="Academics"
        title={term.name}
        sub={`${term.classes.length} classes${term.weightage ? ` · counts ${term.weightage}% toward the final result` : ""}`}
        actions={
          <ButtonLink href="/app/report-cards" variant="secondary" size="sm">
            <FileCheck2 className="size-4" /> Report cards
          </ButtonLink>
        }
      />

      <div className="space-y-5">
        {await Promise.all(
          term.classes.map(async (c) =>
            c.isHolistic ? (
              <HolisticClassCard
                key={c.termId}
                c={c}
                skills={await getSkillTermDetail(actor.schoolId, c.termId)}
                canManage={canManage}
              />
            ) : (
              <TermClassCard key={c.termId} c={c} canManage={canManage} teachers={teachers} />
            ),
          ),
        )}
      </div>
    </>
  );
}
