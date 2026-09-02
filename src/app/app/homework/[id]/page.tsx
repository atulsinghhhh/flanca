import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { getChatPerson } from "@/lib/queries/chat";
import { canSetHomework, canSubmitHomework } from "@/lib/core/homework-core";
import { Badge, Card, CardHead, PageHead } from "@/components/ui/primitives";
import { ManagePanel, type RosterRow } from "./manage-panel";
import { SubmitPanel, type MySubmission } from "./submit-panel";

export const metadata = { title: "Homework — Flanca" };

const DATE = (d: Date | null) =>
  d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

export default async function HomeworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;

  const hw = await db.homework.findFirst({
    where: { id, schoolId: actor.schoolId },
    include: {
      class: { select: { name: true } },
      section: { select: { id: true, name: true } },
      subject: { select: { name: true } },
      staff: { include: { user: { select: { name: true } } } },
    },
  });
  if (!hw) notFound();

  const person = await getChatPerson(actor.schoolId, actor.id);
  const isOffice = Boolean(person?.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r)));
  const canManage = person
    ? canSetHomework({
        roles: person.roles,
        classTeacherOfSectionIds: person.classTeacherOfSectionIds,
        teachesSectionIds: person.teachesSectionIds,
        sectionId: hw.sectionId,
        isActiveStaff: person.isActiveStaff || isOffice,
      }).allowed
    : false;

  const student = await db.student.findFirst({
    where: { schoolId: actor.schoolId, userId: actor.id },
    select: { id: true, classId: true, sectionId: true },
  });

  return (
    <>
      <Link href="/app/homework" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink">
        <ArrowLeft className="size-3.5" /> Homework
      </Link>

      <PageHead
        eyebrow={`${hw.class?.name ?? ""} ${hw.section?.name ?? ""}`.trim()}
        title={hw.title}
        sub={`${hw.subject?.name ?? "All subjects"} · set by ${hw.staff?.user.name ?? "the office"} · due ${DATE(hw.dueOn)}`}
      />

      {hw.details ? (
        <Card className="mb-5">
          <div className="px-5 py-4 text-[14px] leading-relaxed text-ink-2">{hw.details}</div>
        </Card>
      ) : null}

      {canManage ? (
        <ManageSection
          homeworkId={hw.id}
          status={hw.status}
          title={hw.title}
          details={hw.details}
          dueIso={hw.dueOn ? hw.dueOn.toISOString().slice(0, 10) : null}
          maxMarks={hw.maxMarks}
          classId={hw.classId}
          sectionId={hw.sectionId}
          schoolId={actor.schoolId}
        />
      ) : student ? (
        <StudentSection
          homeworkId={hw.id}
          status={hw.status}
          maxMarks={hw.maxMarks}
          homeworkClassId={hw.classId}
          homeworkSectionId={hw.sectionId}
          studentId={student.id}
          studentClassId={student.classId}
          studentSectionId={student.sectionId}
        />
      ) : person?.roles.includes("PARENT") ? (
        <ParentSection userId={actor.id} schoolId={actor.schoolId} homeworkId={hw.id} homeworkClassId={hw.classId} homeworkSectionId={hw.sectionId} maxMarks={hw.maxMarks} />
      ) : (
        <Card>
          <CardHead title="Status" />
          <p className="px-5 py-4 text-[13.5px] text-ink-3">
            <Badge tone={hw.status === "DRAFT" ? "neutral" : hw.status === "ASSIGNED" ? "good" : "bad"}>{hw.status}</Badge>
          </p>
        </Card>
      )}
    </>
  );
}

async function ManageSection({
  homeworkId,
  status,
  title,
  details,
  dueIso,
  maxMarks,
  classId,
  sectionId,
  schoolId,
}: {
  homeworkId: string;
  status: "DRAFT" | "ASSIGNED" | "CLOSED";
  title: string;
  details: string | null;
  dueIso: string | null;
  maxMarks: number | null;
  classId: string;
  sectionId: string | null;
  schoolId: string;
}) {
  const students = await db.student.findMany({
    where: { schoolId, classId, ...(sectionId ? { sectionId } : {}), status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      admissionNumber: true,
      homeworkSubmissions: {
        where: { homeworkId },
        select: { id: true, submittedAt: true, note: true, fileUrl: true, marks: true, feedback: true },
      },
    },
  });

  const roster: RosterRow[] = students.map((s) => {
    const sub = s.homeworkSubmissions[0] ?? null;
    return {
      studentId: s.id,
      name: s.name,
      admissionNumber: s.admissionNumber,
      submissionId: sub?.id ?? null,
      submittedAt: sub?.submittedAt.toISOString() ?? null,
      note: sub?.note ?? null,
      fileUrl: sub?.fileUrl ?? null,
      marks: sub?.marks ?? null,
      feedback: sub?.feedback ?? null,
    };
  });

  return (
    <ManagePanel
      homeworkId={homeworkId}
      status={status}
      title={title}
      details={details}
      dueIso={dueIso}
      maxMarks={maxMarks}
      roster={roster}
    />
  );
}

async function StudentSection({
  homeworkId,
  status,
  maxMarks,
  homeworkClassId,
  homeworkSectionId,
  studentId,
  studentClassId,
  studentSectionId,
}: {
  homeworkId: string;
  status: "DRAFT" | "ASSIGNED" | "CLOSED";
  maxMarks: number | null;
  homeworkClassId: string;
  homeworkSectionId: string | null;
  studentId: string;
  studentClassId: string | null;
  studentSectionId: string | null;
}) {
  const existing = await db.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId } },
    select: { submittedAt: true, note: true, fileUrl: true, marks: true, feedback: true },
  });

  const guard = canSubmitHomework({
    status,
    studentSectionId,
    homeworkSectionId,
    homeworkClassId,
    studentClassId,
    alreadySubmitted: Boolean(existing),
  });

  const mine: MySubmission | null = existing
    ? {
        submittedAt: existing.submittedAt.toISOString(),
        note: existing.note,
        fileUrl: existing.fileUrl,
        marks: existing.marks,
        feedback: existing.feedback,
      }
    : null;

  return <SubmitPanel homeworkId={homeworkId} maxMarks={maxMarks} mine={mine} canSubmit={guard.allowed} whyNot={guard.reason} />;
}

async function ParentSection({
  userId,
  schoolId,
  homeworkId,
  homeworkClassId,
  homeworkSectionId,
  maxMarks,
}: {
  userId: string;
  schoolId: string;
  homeworkId: string;
  homeworkClassId: string;
  homeworkSectionId: string | null;
  maxMarks: number | null;
}) {
  const links = await db.parentLink.findMany({
    where: { schoolId, userId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          classId: true,
          sectionId: true,
          homeworkSubmissions: {
            where: { homeworkId },
            select: { submittedAt: true, marks: true, feedback: true },
          },
        },
      },
    },
  });

  const mine = links
    .map((l) => l.student)
    .filter((s) => s.classId === homeworkClassId && (!homeworkSectionId || s.sectionId === homeworkSectionId));

  if (mine.length === 0) {
    return (
      <Card>
        <p className="px-5 py-4 text-[13.5px] text-ink-3">This homework is not for your child's class.</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHead title="Your child" />
      <ul className="divide-y divide-line">
        {mine.map((s) => {
          const sub = s.homeworkSubmissions[0] ?? null;
          return (
            <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="text-[13.5px] font-medium">{s.name}</span>
              {!sub ? (
                <Badge tone="neutral">Not handed in yet</Badge>
              ) : sub.marks != null ? (
                <Badge tone="good">
                  <CheckCircle2 className="size-3" /> {sub.marks}
                  {maxMarks ? `/${maxMarks}` : ""}
                </Badge>
              ) : (
                <Badge tone="warn">Handed in — waiting for the teacher</Badge>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
