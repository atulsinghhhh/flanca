"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireActor, requireRole, hasRole, OFFICE } from "@/lib/session";
import {
  canDeleteExamCycle, canDeleteExamPaper, suggestPaperDates, tidyCycleName,
  validateExamCycle, validateExamPaper,
} from "@/lib/core/exam-core";
import { CBSE_8_POINT, gradeFor, percentBp } from "@/lib/core/grading-core";
import { buildClassReports } from "@/lib/queries/exams";
import { buildHolisticClassReport, isHolisticClass } from "@/lib/queries/skill-assessment";
import { isClassTeacherOf, isSubjectTeacherOf } from "@/lib/mobile/mutations/exams";
import { pushToUser } from "@/lib/push";

export type MarkEntry = { studentId: string; marks: number | null; isAbsent: boolean };

/**
 * Save a marks sheet.
 *
 * Idempotent on (exam, student) so a teacher whose connection dropped can hit
 * save again without creating a second row or losing an entry. Marks are
 * validated against the exam's maximum here, on the server — a typo of 950 for
 * 95 must never reach a report card.
 */
export async function saveMarks(input: { examId: string; entries: MarkEntry[] }) {
  const actor = await requireActor();
  if (!hasRole(actor, "OWNER", "PRINCIPAL", "ADMIN", "TEACHER")) {
    return { error: "You do not have permission to enter marks." };
  }

  const exam = await db.exam.findFirst({
    where: { id: input.examId, schoolId: actor.schoolId },
    include: {
      subject: { select: { name: true } },
      class: { select: { name: true } },
      examTerm: { select: { name: true, isPublished: true } },
    },
  });
  if (!exam) return { error: "That exam is not in this school." };

  // Class-scoped (class teacher) or subject-scoped (this subject's timetable
  // teacher) — the same ownership rule attendance and report cards use.
  // StaffSubject is never used for this: it carries no class/section scoping
  // and would hand every subject teacher in the school access to every class.
  const allowed =
    hasRole(actor, "OWNER", "PRINCIPAL", "ADMIN") ||
    (await isClassTeacherOf(actor, exam.classId)) ||
    (await isSubjectTeacherOf(actor, exam.classId, exam.subjectId));
  if (!allowed) {
    return { error: "Only that class's class teacher or this subject's own teacher can enter its marks." };
  }

  const roll = await db.student.findMany({
    where: { schoolId: actor.schoolId, classId: exam.classId ?? undefined, status: "ACTIVE" },
    select: { id: true },
  });
  const onRoll = new Set(roll.map((r) => r.id));

  const problems: string[] = [];
  const accepted = input.entries.filter((e) => {
    if (!onRoll.has(e.studentId)) return false;
    if (e.marks == null) return true;
    if (!Number.isFinite(e.marks) || e.marks < 0) {
      problems.push("A mark cannot be negative.");
      return false;
    }
    if (e.marks > exam.maxMarks) {
      problems.push(`${e.marks} is above the maximum of ${exam.maxMarks}.`);
      return false;
    }
    return true;
  });

  if (problems.length > 0) {
    return { error: [...new Set(problems)].join(" ") };
  }

  let entered = 0;

  await db.$transaction(
    async (tx) => {
      for (const e of accepted) {
        const grade =
          e.isAbsent || e.marks == null
            ? null
            : (gradeFor(percentBp(e.marks, exam.maxMarks), CBSE_8_POINT)?.grade ?? null);

        await tx.examResult.upsert({
          where: { examId_studentId: { examId: exam.id, studentId: e.studentId } },
          create: {
            schoolId: actor.schoolId,
            examId: exam.id,
            studentId: e.studentId,
            marks: e.isAbsent ? null : e.marks,
            isAbsent: e.isAbsent,
            grade,
            state: exam.examTerm.isPublished ? "PUBLISHED" : "DRAFT",
            enteredBy: actor.id,
            clientKey: `mk:${exam.id}:${e.studentId}`,
          },
          update: {
            marks: e.isAbsent ? null : e.marks,
            isAbsent: e.isAbsent,
            grade,
            enteredBy: actor.id,
            enteredAt: new Date(),
          },
        });
        if (e.marks != null || e.isAbsent) entered++;
      }
    },
    { timeout: 60_000 },
  );

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "exam.marks.save",
    entity: "Exam",
    entityId: exam.id,
    summary: `Entered marks for ${exam.class?.name ?? ""} ${exam.subject?.name ?? ""} (${exam.examTerm.name}): ${entered} students`,
  });

  revalidatePath("/app/exams");
  revalidatePath("/app/report-cards");
  return { ok: true, entered };
}

export type SkillEntry = { studentId: string; rating: "BEGINNING" | "DEVELOPING" | "PROFICIENT" | null };

/**
 * Save a skill-assessment sheet — Nursery/LKG/UKG's equivalent of saveMarks.
 * Keyed by (examTerm, subject) rather than an Exam row, since pre-primary has
 * no papers; same idempotent upsert-by-(term,subject,student) shape.
 */
export async function saveSkillAssessment(input: { examTermId: string; subjectId: string; entries: SkillEntry[] }) {
  const actor = await requireActor();
  if (!hasRole(actor, "OWNER", "PRINCIPAL", "ADMIN", "TEACHER")) {
    return { error: "You do not have permission to enter this." };
  }

  const [term, subject] = await Promise.all([
    db.examTerm.findFirst({
      where: { id: input.examTermId, schoolId: actor.schoolId },
      select: { classId: true, isPublished: true },
    }),
    db.subject.findFirst({ where: { id: input.subjectId, schoolId: actor.schoolId }, select: { classId: true } }),
  ]);
  if (!term || !subject || subject.classId !== term.classId) {
    return { error: "That skill area is not in this term's class." };
  }

  const allowed =
    hasRole(actor, "OWNER", "PRINCIPAL", "ADMIN") ||
    (await isClassTeacherOf(actor, term.classId)) ||
    (await isSubjectTeacherOf(actor, term.classId, input.subjectId));
  if (!allowed) {
    return { error: "Only that class's class teacher or this subject's own teacher can enter this." };
  }
  if (term.isPublished) {
    return { error: "This term's report cards are already published. Unpublish first to make changes." };
  }

  const roll = await db.student.findMany({
    where: { schoolId: actor.schoolId, classId: term.classId ?? undefined, status: "ACTIVE" },
    select: { id: true },
  });
  const onRoll = new Set(roll.map((r) => r.id));
  const accepted = input.entries.filter((e) => onRoll.has(e.studentId) && e.rating != null);

  let entered = 0;
  await db.$transaction(
    accepted.map((e) =>
      db.skillAssessment.upsert({
        where: { examTermId_subjectId_studentId: { examTermId: input.examTermId, subjectId: input.subjectId, studentId: e.studentId } },
        create: {
          schoolId: actor.schoolId, examTermId: input.examTermId, subjectId: input.subjectId,
          studentId: e.studentId, rating: e.rating!, enteredBy: actor.id,
        },
        update: { rating: e.rating!, enteredBy: actor.id, enteredAt: new Date() },
      }),
    ),
  );
  entered = accepted.length;

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "exam.skill.save",
    entity: "ExamTerm",
    entityId: input.examTermId,
    summary: `Entered skill ratings for subject ${input.subjectId}: ${entered} students`,
  });

  revalidatePath("/app/exams");
  revalidatePath("/app/report-cards");
  return { ok: true, entered };
}

/**
 * Generate a class's report cards in ONE action — the contract we hold ourselves
 * to. Each card is a frozen snapshot so a reprint years later is identical.
 */
type GenerateReportCardsResult =
  | { ok: true; written: number; published: boolean; error?: undefined }
  | { ok?: undefined; error: string };

export async function generateReportCards(termId: string, publish: boolean): Promise<GenerateReportCardsResult> {
  const actor = await requireActor();

  const term = await db.examTerm.findFirst({
    where: { id: termId, schoolId: actor.schoolId },
    select: { classId: true, class: { select: { sequenceOrder: true } } },
  });
  if (!term) return { error: "That term no longer exists." };

  const isOffice = hasRole(actor, "OWNER", "PRINCIPAL", "ADMIN");
  // A class's own class teacher may publish it, same ownership rule attendance
  // uses — but a class with two sections has two class teachers, and either
  // one may act for the whole class since report cards are generated per
  // class-term, not per section.
  const isClassTeacher = !isOffice && term.classId
    ? (await db.section.count({ where: { classId: term.classId, classTeacherId: actor.id } })) > 0
    : false;
  if (!isOffice && !isClassTeacher) {
    return { error: "Only the office or this class's own class teacher can generate report cards." };
  }

  // Nursery/LKG/UKG are graded holistically (skill ratings), never examined —
  // a completely different report card shape from every other class.
  if (isHolisticClass(term.class?.sequenceOrder ?? 99)) {
    return generateHolisticReportCards(actor.schoolId, termId, publish);
  }

  const built = await buildClassReports(actor.schoolId, termId);
  if (!built) return { error: "That term no longer exists." };

  const pending = built.rows.filter((r) => r.totals.result === "PENDING");
  if (publish && pending.length > 0) {
    return {
      error: `${pending.length} student${pending.length === 1 ? "" : "s"} still have subjects with no marks entered. Enter them, or generate without publishing.`,
    };
  }

  const now = new Date();
  let written = 0;

  await db.$transaction(
    async (tx) => {
      for (const row of built.rows) {
        const snapshot = {
          term: built.term.name,
          className: built.term.className,
          section: row.sectionName,
          subjects: row.subjects.map((s) => ({
            subject: s.subject,
            maxMarks: s.maxMarks,
            marks: s.marks,
            isAbsent: s.isAbsent ?? false,
            grade:
              s.marks == null
                ? null
                : (gradeFor(percentBp(s.marks, s.maxMarks), CBSE_8_POINT)?.grade ?? null),
          })),
          failedSubjects: row.totals.failedSubjects,
          result: row.totals.result,
          pending: row.totals.pending,
        };

        await tx.reportCard.upsert({
          where: { studentId_examTermId: { studentId: row.studentId, examTermId: termId } },
          create: {
            schoolId: actor.schoolId,
            studentId: row.studentId,
            examTermId: termId,
            classId: built.term.classId,
            snapshot: snapshot as never,
            totalMarks: row.totals.totalMarks,
            maxMarks: row.totals.maxMarks,
            percentage: row.totals.percentBp,
            grade: row.totals.grade,
            rankInClass: row.rank,
            attendancePercent: row.attendancePercentBp,
            publishedAt: publish ? now : null,
          },
          update: {
            snapshot: snapshot as never,
            totalMarks: row.totals.totalMarks,
            maxMarks: row.totals.maxMarks,
            percentage: row.totals.percentBp,
            grade: row.totals.grade,
            rankInClass: row.rank,
            attendancePercent: row.attendancePercentBp,
            publishedAt: publish ? now : null,
            generatedAt: now,
          },
        });
        written++;
      }

      if (publish) {
        await tx.examTerm.update({ where: { id: termId }, data: { isPublished: true, resultDate: now } });
        await tx.examResult.updateMany({
          where: { exam: { examTermId: termId } },
          data: { state: "PUBLISHED" },
        });
      }
    },
    { timeout: 120_000 },
  );

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: publish ? "report.publish" : "report.generate",
    entity: "ExamTerm",
    entityId: termId,
    summary: `${publish ? "Published" : "Generated"} ${written} report cards for ${built.term.className} — ${built.term.name}`,
  });

  if (publish) {
    await notifyReportCardParents(actor.schoolId, termId, built.term.name, built.rows.map((r) => r.studentId));
  }

  revalidatePath("/app/report-cards");
  revalidatePath("/app/exams");
  return { ok: true, written, published: publish };
}

/** Shared by both the marks-based and holistic publish paths — a parent does not care which kind of card their child got, only that it's ready. */
async function notifyReportCardParents(schoolId: string, termId: string, termName: string, studentIds: string[]) {
  const [parents, cards] = await Promise.all([
    db.parentLink.findMany({
      where: { schoolId, studentId: { in: studentIds } },
      select: { userId: true, studentId: true, student: { select: { name: true } } },
    }),
    db.reportCard.findMany({
      where: { schoolId, examTermId: termId, studentId: { in: studentIds } },
      select: { id: true, studentId: true },
    }),
  ]);
  const cardByStudent = new Map(cards.map((c) => [c.studentId, c.id]));
  const toNotify = parents.filter((p) => cardByStudent.has(p.studentId));
  if (toNotify.length === 0) return;

  await db.notification.createMany({
    data: toNotify.map((p) => ({
      schoolId,
      userId: p.userId,
      kind: "RESULT",
      title: "Report card published",
      body: `${p.student.name}'s report card for ${termName} is ready`,
      linkUrl: `/app/report-cards/${cardByStudent.get(p.studentId)}`,
    })),
    skipDuplicates: true,
  });
  await Promise.all(
    toNotify.map((p) =>
      pushToUser(schoolId, p.userId, {
        title: "Report card published",
        body: `${p.student.name} — ${termName}`,
        url: `/app/report-cards/${cardByStudent.get(p.studentId)}`,
        tag: `report-card-${cardByStudent.get(p.studentId)}`,
      }),
    ),
  ).catch(() => undefined);
}

/** Nursery/LKG/UKG's report card: skill ratings, no marks/grade/rank. Mirrors generateReportCards' contract (one action, frozen snapshot) for the holistic shape. */
async function generateHolisticReportCards(schoolId: string, termId: string, publish: boolean): Promise<GenerateReportCardsResult> {
  const built = await buildHolisticClassReport(schoolId, termId);
  if (!built) return { error: "That term no longer exists." };

  const pending = built.rows.filter((r) => r.pending);
  if (publish && pending.length > 0) {
    return {
      error: `${pending.length} student${pending.length === 1 ? "" : "s"} still have a skill area with no rating entered. Enter them, or generate without publishing.`,
    };
  }

  const now = new Date();
  let written = 0;

  await db.$transaction(async (tx) => {
    for (const row of built.rows) {
      const snapshot = {
        term: built.term.name,
        className: built.term.className,
        section: row.sectionName,
        skills: row.skills,
        holistic: true as const,
      };

      await tx.reportCard.upsert({
        where: { studentId_examTermId: { studentId: row.studentId, examTermId: termId } },
        create: {
          schoolId, studentId: row.studentId, examTermId: termId, classId: built.term.classId,
          snapshot: snapshot as never,
          attendancePercent: row.attendancePercentBp,
          publishedAt: publish ? now : null,
        },
        update: {
          snapshot: snapshot as never,
          attendancePercent: row.attendancePercentBp,
          publishedAt: publish ? now : null,
          generatedAt: now,
        },
      });
      written++;
    }
    if (publish) await tx.examTerm.update({ where: { id: termId }, data: { isPublished: true, resultDate: now } });
  }, { timeout: 120_000 });

  if (publish) {
    await notifyReportCardParents(schoolId, termId, built.term.name, built.rows.map((r) => r.studentId));
  }

  revalidatePath("/app/report-cards");
  revalidatePath("/app/exams");
  return { ok: true, written, published: publish };
}

/** A class teacher's or principal's remark, per card. Kept separate so it survives regeneration. */
export async function saveRemark(
  reportCardId: string,
  remark: string,
  field: "classTeacher" | "principal" = "classTeacher",
) {
  const actor = await requireActor();
  if (!hasRole(actor, "OWNER", "PRINCIPAL", "ADMIN", "TEACHER")) {
    return { error: "You do not have permission to write remarks." };
  }
  if (field === "principal" && !hasRole(actor, "PRINCIPAL")) {
    return { error: "Only the principal can write the principal's remark." };
  }

  const card = await db.reportCard.findFirst({
    where: { id: reportCardId, schoolId: actor.schoolId },
    select: { id: true, studentId: true },
  });
  if (!card) return { error: "That report card no longer exists." };

  await db.reportCard.update({
    where: { id: card.id },
    data:
      field === "principal"
        ? { principalRemark: remark.trim() || null }
        : { classTeacherRemark: remark.trim() || null },
  });

  revalidatePath(`/app/report-cards/${card.id}`);
  return { ok: true };
}

/**
 * Setting up the exams themselves.
 *
 * Everything above this line assumed the papers already existed — the seed made
 * them. A school's first unit test had nowhere to go: no way to create a cycle, no
 * way to schedule a paper, no way to say what it is out of.
 *
 * The shape follows what is already in the database rather than fighting it. An
 * "exam cycle" as a school says it — Unit Test 1 — is one ExamTerm row per class,
 * which is why `getExamTerms` groups them back by name to show one row. So creating
 * a cycle writes a row for each class it covers, and everything here works on the
 * cycle as a whole, by name, across the year.
 */

export async function createExamCycle(input: {
  name: string;
  startIso?: string | null;
  endIso?: string | null;
  weightage?: number | null;
  classIds?: string[] | null;
}) {
  const actor = await requireRole(...OFFICE);

  const year = await db.academicYear.findFirst({
    where: { schoolId: actor.schoolId, isCurrent: true },
    select: { id: true, name: true },
  });
  if (!year) return { error: "There is no current academic year. Set one first." };

  const existing = await db.examTerm.findMany({
    where: { schoolId: actor.schoolId, academicYearId: year.id },
    select: { name: true, weightage: true, sequenceOrder: true },
  });
  const existingNames = [...new Set(existing.map((e) => e.name))];

  // One weightage per cycle, not per class row — otherwise a thirteen-class cycle
  // would look like thirteen cycles adding to 1,300%.
  const weightByName = new Map<string, number>();
  for (const e of existing) if (e.weightage != null) weightByName.set(e.name, e.weightage);

  const check = validateExamCycle({
    name: input.name,
    startIso: input.startIso ?? null,
    endIso: input.endIso ?? null,
    weightage: input.weightage ?? null,
    existingNames,
    otherWeightages: [...weightByName.values()],
  });
  if (!check.ok) {
    return { error: check.messages.find((m) => m.level === "ERROR")!.message, messages: check.messages };
  }

  const classes = await db.class.findMany({
    where: {
      schoolId: actor.schoolId,
      ...(input.classIds?.length ? { id: { in: input.classIds } } : {}),
    },
    orderBy: { sequenceOrder: "asc" },
    select: { id: true, name: true },
  });
  if (classes.length === 0) return { error: "There are no classes to hold an exam for." };

  const name = tidyCycleName(input.name);
  const order = existing.reduce((a, e) => Math.max(a, e.sequenceOrder), -1) + 1;
  const startDate = input.startIso ? new Date(`${input.startIso}T00:00:00.000Z`) : null;
  const endDate = input.endIso ? new Date(`${input.endIso}T00:00:00.000Z`) : null;

  await db.examTerm.createMany({
    data: classes.map((c) => ({
      schoolId: actor.schoolId,
      academicYearId: year.id,
      classId: c.id,
      name,
      startDate,
      endDate,
      weightage: input.weightage ?? null,
      sequenceOrder: order,
    })),
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "exam.cycle.create",
    entity: "ExamTerm",
    entityId: year.id,
    summary:
      `Created the exam cycle ${name} in ${year.name} for ${classes.length} ${classes.length === 1 ? "class" : "classes"}` +
      (input.weightage != null ? `, worth ${input.weightage}% of the year` : "") +
      ". No papers are scheduled yet.",
  });

  revalidatePath("/app/exams");
  return { ok: true as const, messages: check.messages, classes: classes.length };
}

/**
 * Schedule a whole class's papers for a cycle, one per subject.
 *
 * The alternative — a form per paper — is thirteen classes times seven subjects of
 * typing for something the school does the same way every time. Co-scholastic
 * subjects are left out: they are graded, not marked out of a total.
 */
export async function schedulePapers(input: {
  cycleName: string;
  classId: string;
  startIso: string;
  maxMarks: number;
  passMarks?: number | null;
  papersPerDay?: number;
  durationMins?: number | null;
}) {
  const actor = await requireRole(...OFFICE);

  const year = await db.academicYear.findFirst({
    where: { schoolId: actor.schoolId, isCurrent: true },
    select: { id: true },
  });
  if (!year) return { error: "There is no current academic year." };

  const term = await db.examTerm.findFirst({
    where: { schoolId: actor.schoolId, academicYearId: year.id, name: input.cycleName, classId: input.classId },
    select: { id: true, name: true, startDate: true, endDate: true, class: { select: { name: true } } },
  });
  if (!term) return { error: `${input.cycleName} does not cover that class.` };

  const paperCheck = validateExamPaper({
    maxMarks: input.maxMarks,
    passMarks: input.passMarks ?? null,
    examDateIso: input.startIso,
    cycleStartIso: term.startDate?.toISOString().slice(0, 10) ?? null,
    cycleEndIso: term.endDate?.toISOString().slice(0, 10) ?? null,
  });
  if (!paperCheck.ok) {
    return { error: paperCheck.messages.find((m) => m.level === "ERROR")!.message, messages: paperCheck.messages };
  }

  const subjects = await db.subject.findMany({
    where: { schoolId: actor.schoolId, classId: input.classId, isCoScholastic: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  if (subjects.length === 0) return { error: "That class has no subjects to examine yet." };

  const already = new Set(
    (
      await db.exam.findMany({
        where: { schoolId: actor.schoolId, examTermId: term.id },
        select: { subjectId: true },
      })
    ).map((e) => e.subjectId),
  );
  const todo = subjects.filter((s) => !already.has(s.id));
  if (todo.length === 0) return { error: `Every subject in ${term.class?.name ?? "that class"} already has a ${term.name} paper.` };

  const dates = suggestPaperDates(input.startIso, todo.length, input.papersPerDay ?? 1);
  if (dates.length !== todo.length) return { error: "Could not work out a datesheet from that start date." };

  await db.exam.createMany({
    data: todo.map((s, i) => ({
      schoolId: actor.schoolId,
      examTermId: term.id,
      classId: input.classId,
      subjectId: s.id,
      name: `${term.name} — ${s.name}`,
      examDate: new Date(`${dates[i]}T00:00:00.000Z`),
      durationMins: input.durationMins ?? 120,
      maxMarks: input.maxMarks,
      passMarks: input.passMarks ?? Math.round(input.maxMarks * 0.33),
    })),
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "exam.paper.create",
    entity: "ExamTerm",
    entityId: term.id,
    summary:
      `Scheduled ${todo.length} ${term.name} ${todo.length === 1 ? "paper" : "papers"} for ${term.class?.name ?? "a class"}, ` +
      `${dates[0]} to ${dates[dates.length - 1]}, each out of ${input.maxMarks}` +
      (already.size > 0 ? `. ${already.size} already existed and were left alone` : ""),
  });

  revalidatePath("/app/exams");
  return { ok: true as const, created: todo.length, messages: paperCheck.messages };
}

/** Change one paper: its date, what it is out of, how long it runs. */
export async function updateExamPaper(input: {
  examId: string;
  examDateIso?: string | null;
  maxMarks?: number | null;
  passMarks?: number | null;
  theoryMax?: number | null;
  internalMax?: number | null;
  durationMins?: number | null;
  roomNo?: string | null;
}) {
  const actor = await requireRole(...OFFICE);

  const exam = await db.exam.findFirst({
    where: { id: input.examId, schoolId: actor.schoolId },
    select: {
      id: true, name: true, examDate: true, maxMarks: true, passMarks: true,
      theoryMax: true, internalMax: true, durationMins: true, roomNo: true,
      examTerm: { select: { startDate: true, endDate: true } },
      _count: { select: { results: true } },
    },
  });
  if (!exam) return { error: "That paper is not in this school." };

  const maxMarks = input.maxMarks ?? exam.maxMarks;
  const check = validateExamPaper({
    maxMarks,
    passMarks: input.passMarks ?? exam.passMarks,
    theoryMax: input.theoryMax ?? exam.theoryMax,
    internalMax: input.internalMax ?? exam.internalMax,
    examDateIso: input.examDateIso ?? exam.examDate?.toISOString().slice(0, 10) ?? null,
    cycleStartIso: exam.examTerm?.startDate?.toISOString().slice(0, 10) ?? null,
    cycleEndIso: exam.examTerm?.endDate?.toISOString().slice(0, 10) ?? null,
  });
  if (!check.ok) {
    return { error: check.messages.find((m) => m.level === "ERROR")!.message, messages: check.messages };
  }

  // Lowering the total after marks are in would turn somebody's 78 out of 80 into 78
  // out of 50. The marks are the school's record; the paper has to fit them.
  if (exam._count.results > 0 && maxMarks < exam.maxMarks) {
    return {
      error: `${exam._count.results} marks are already entered out of ${exam.maxMarks}. Lowering the total would put somebody above full marks.`,
    };
  }

  await db.exam.update({
    where: { id: exam.id },
    data: {
      examDate: input.examDateIso ? new Date(`${input.examDateIso}T00:00:00.000Z`) : undefined,
      maxMarks: input.maxMarks ?? undefined,
      passMarks: input.passMarks ?? undefined,
      theoryMax: input.theoryMax ?? undefined,
      internalMax: input.internalMax ?? undefined,
      durationMins: input.durationMins ?? undefined,
      roomNo: input.roomNo?.trim() || undefined,
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "exam.paper.update",
    entity: "Exam",
    entityId: exam.id,
    summary: `Changed the ${exam.name} paper`,
    before: { examDate: exam.examDate?.toISOString().slice(0, 10) ?? null, maxMarks: exam.maxMarks, passMarks: exam.passMarks },
    after: { examDate: input.examDateIso ?? exam.examDate?.toISOString().slice(0, 10) ?? null, maxMarks, passMarks: input.passMarks ?? exam.passMarks },
    reversible: true,
  });

  revalidatePath("/app/exams");
  return { ok: true as const, messages: check.messages };
}

/** Assign a teacher to invigilate one exam sitting. Idempotent — assigning the same pair twice is a no-op, not an error. */
export async function assignExamDuty(input: { examId: string; staffId: string }) {
  const actor = await requireRole(...OFFICE);

  const [exam, staff] = await Promise.all([
    db.exam.findFirst({
      where: { id: input.examId, schoolId: actor.schoolId },
      select: {
        id: true, examDate: true, roomNo: true,
        subject: { select: { name: true } },
        class: { select: { name: true } },
        examTerm: { select: { name: true } },
      },
    }),
    db.staff.findFirst({
      where: { id: input.staffId, schoolId: actor.schoolId },
      select: { id: true, userId: true, user: { select: { name: true } } },
    }),
  ]);
  if (!exam) return { error: "That paper is not in this school." };
  if (!staff) return { error: "That staff member is not in this school." };

  await db.examDuty.upsert({
    where: { examId_staffId: { examId: exam.id, staffId: staff.id } },
    create: { schoolId: actor.schoolId, examId: exam.id, staffId: staff.id },
    update: {},
  });

  const subjectName = exam.subject?.name ?? "exam";
  const dateStr = exam.examDate
    ? exam.examDate.toLocaleDateString("en-IN", { day: "numeric", month: "long" })
    : "a date to be confirmed";
  const body = `${exam.class?.name ?? ""} ${subjectName} — ${exam.examTerm.name}, ${dateStr}${exam.roomNo ? `, Room ${exam.roomNo}` : ""}`;

  await db.notification.create({
    data: {
      schoolId: actor.schoolId,
      userId: staff.userId,
      kind: "EXAM_DUTY",
      title: "Invigilation duty assigned",
      body,
      linkUrl: "/app/exams",
    },
  });
  await pushToUser(actor.schoolId, staff.userId, {
    title: "Invigilation duty assigned",
    body,
    url: "/app/exams",
    tag: `exam-duty-${exam.id}`,
  }).catch(() => undefined);

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "exam.duty.assign",
    entity: "Exam",
    entityId: exam.id,
    summary: `${staff.user.name} assigned invigilation duty for ${exam.class?.name ?? ""} ${subjectName}`,
  });

  revalidatePath("/app/exams");
  return { ok: true as const };
}

export async function removeExamDuty(input: { examId: string; staffId: string }) {
  const actor = await requireRole(...OFFICE);

  const removed = await db.examDuty.deleteMany({
    where: { examId: input.examId, staffId: input.staffId, schoolId: actor.schoolId },
  });
  if (removed.count === 0) return { error: "That duty assignment no longer exists." };

  revalidatePath("/app/exams");
  return { ok: true as const };
}

export async function deleteExamPaper(input: { examId: string }) {
  const actor = await requireRole(...OFFICE);

  const exam = await db.exam.findFirst({
    where: { id: input.examId, schoolId: actor.schoolId },
    select: { id: true, name: true, _count: { select: { results: true } } },
  });
  if (!exam) return { error: "That paper is not in this school." };

  const guard = canDeleteExamPaper({ results: exam._count.results });
  if (!guard.allowed) return { error: guard.reason! };

  await db.exam.delete({ where: { id: exam.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "exam.paper.delete",
    entity: "Exam",
    entityId: exam.id,
    summary: `Removed the ${exam.name} paper, which had no marks against it`,
  });

  revalidatePath("/app/exams");
  return { ok: true as const };
}

/** Undo a publish: unlocks marks entry and pulls the term's cards back to draft. */
export async function unpublishExamTerm(termId: string) {
  const actor = await requireRole(...OFFICE);

  const term = await db.examTerm.findFirst({
    where: { id: termId, schoolId: actor.schoolId },
    select: { id: true, name: true, isPublished: true, class: { select: { name: true } } },
  });
  if (!term) return { error: "That term is not in this school." };
  if (!term.isPublished) return { error: "That term is not published." };

  await db.$transaction(async (tx) => {
    await tx.examTerm.update({ where: { id: term.id }, data: { isPublished: false } });
    await tx.examResult.updateMany({
      where: { exam: { examTermId: term.id } },
      data: { state: "DRAFT" },
    });
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "exam.term.unpublish",
    entity: "ExamTerm",
    entityId: term.id,
    summary: `Unpublished ${term.name}${term.class?.name ? ` — ${term.class.name}` : ""}. Marks are unlocked for correction`,
    reversible: true,
  });

  revalidatePath("/app/exams");
  revalidatePath(`/app/exams/term/${encodeURIComponent(term.name)}`);
  revalidatePath("/app/report-cards");
  return { ok: true as const };
}

/** Remove a whole cycle — every class's copy of it — while nothing is marked. */
export async function deleteExamCycle(input: { cycleName: string }) {
  const actor = await requireRole(...OFFICE);

  const year = await db.academicYear.findFirst({
    where: { schoolId: actor.schoolId, isCurrent: true },
    select: { id: true, name: true },
  });
  if (!year) return { error: "There is no current academic year." };

  const terms = await db.examTerm.findMany({
    where: { schoolId: actor.schoolId, academicYearId: year.id, name: input.cycleName },
    select: {
      id: true,
      _count: { select: { reportCards: true } },
      exams: { select: { _count: { select: { results: true } } } },
    },
  });
  if (terms.length === 0) return { error: `No exam cycle in ${year.name} is called ${input.cycleName}.` };

  const results = terms.reduce((a, t) => a + t.exams.reduce((x, e) => x + e._count.results, 0), 0);
  const reportCards = terms.reduce((a, t) => a + t._count.reportCards, 0);
  const guard = canDeleteExamCycle({ results, reportCards });
  if (!guard.allowed) return { error: guard.reason! };

  await db.examTerm.deleteMany({ where: { id: { in: terms.map((t) => t.id) } } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "exam.cycle.delete",
    entity: "AcademicYear",
    entityId: year.id,
    summary: `Removed the exam cycle ${input.cycleName} from ${year.name}, across ${terms.length} classes. Nothing had been marked against it.`,
  });

  revalidatePath("/app/exams");
  return { ok: true as const };
}
