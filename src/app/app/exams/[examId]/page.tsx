import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { hasRole, OFFICE, requireActor } from "@/lib/session";
import { getMarksSheet } from "@/lib/queries/exams";
import { isClassTeacherOf, isSubjectTeacherOf } from "@/lib/mobile/mutations/exams";
import { Badge, Card, Empty, PageHead } from "@/components/ui/primitives";
import { MarksGrid } from "./marks-grid";

export const metadata = { title: "Enter marks — Flanca" };

export default async function MarksPage({ params }: { params: Promise<{ examId: string }> }) {
  const actor = await requireActor();
  const { examId } = await params;

  const sheet = await getMarksSheet(actor.schoolId, examId);
  if (!sheet) notFound();

  const allowed =
    hasRole(actor, ...OFFICE) ||
    (await isClassTeacherOf(actor, sheet.exam.classId)) ||
    (await isSubjectTeacherOf(actor, sheet.exam.classId, sheet.exam.subjectId));
  if (!allowed) {
    return (
      <Card>
        <Empty
          title="Not your subject"
          hint="Only that class's class teacher or this subject's own teacher can open its marks sheet. Ask the office if this looks wrong."
        />
      </Card>
    );
  }

  return (
    <>
      <Link
        href={`/app/exams/term/${encodeURIComponent(sheet.exam.termName)}`}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> {sheet.exam.termName}
      </Link>

      <PageHead
        eyebrow={`${sheet.exam.className} · ${sheet.exam.termName}`}
        title={sheet.exam.subjectName}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            {sheet.exam.examDate ? (
              <span className="inline-flex items-center gap-1.5 text-ink-2">
                <CalendarDays className="size-3.5" />
                {sheet.exam.examDate.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            ) : null}
            <Badge tone={sheet.exam.isPublished ? "good" : "neutral"}>
              {sheet.exam.isPublished ? "Published" : "Draft"}
            </Badge>
          </span>
        }
      />

      {sheet.students.length === 0 ? (
        <Card>
          <Empty title="No students in this class" hint="Add students, or import your register." />
        </Card>
      ) : (
        <MarksGrid
          examId={sheet.exam.id}
          maxMarks={sheet.exam.maxMarks}
          passMarks={sheet.exam.passMarks}
          locked={sheet.exam.isPublished}
          students={sheet.students}
        />
      )}
    </>
  );
}
