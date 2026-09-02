import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { hasRole, OFFICE, requireActor } from "@/lib/session";
import { getSkillSheet } from "@/lib/queries/skill-assessment";
import { isClassTeacherOf, isSubjectTeacherOf } from "@/lib/mobile/mutations/exams";
import { Card, Empty, PageHead } from "@/components/ui/primitives";
import { SkillGrid } from "./skill-grid";

export const metadata = { title: "Skill assessment — Flanca" };

export default async function SkillSheetPage({
  params,
}: {
  params: Promise<{ examTermId: string; subjectId: string }>;
}) {
  const actor = await requireActor();
  const { examTermId, subjectId } = await params;

  const sheet = await getSkillSheet(actor.schoolId, examTermId, subjectId);
  if (!sheet) notFound();

  const allowed =
    hasRole(actor, ...OFFICE) ||
    (await isClassTeacherOf(actor, sheet.classId)) ||
    (await isSubjectTeacherOf(actor, sheet.classId, sheet.subject.id));
  if (!allowed) {
    return (
      <Card>
        <Empty
          title="Not your class"
          hint="Only that class's class teacher or this skill area's own teacher can rate it. Ask the office if this looks wrong."
        />
      </Card>
    );
  }

  return (
    <>
      <Link
        href={`/app/exams/term/${encodeURIComponent(sheet.examTerm.name)}`}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> {sheet.examTerm.name}
      </Link>

      <PageHead eyebrow={`${sheet.className} · ${sheet.examTerm.name}`} title={sheet.subject.name} />

      {sheet.students.length === 0 ? (
        <Card>
          <Empty title="No students in this class" hint="Add students, or import your register." />
        </Card>
      ) : (
        <SkillGrid
          examTermId={sheet.examTerm.id}
          subjectId={sheet.subject.id}
          locked={sheet.examTerm.isPublished}
          students={sheet.students}
        />
      )}
    </>
  );
}
