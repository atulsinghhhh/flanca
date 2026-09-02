import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import {
  canBeClassTeacher,
  canDeleteClass,
  canDeleteSection,
  canDeleteSubject,
  classOrderFor,
  tidyClassName,
  tidySectionName,
  tidySubjectName,
  validateClassName,
  validateSectionName,
  validateSubjectName,
} from "@/lib/core/setup-core";
import {
  canDeleteTerm,
  canDeleteYear,
  suggestTerms,
  tidyYearName,
  validateTermLabel,
  validateYearDates,
  validateYearName,
} from "@/lib/core/year-core";

/**
 * The mobile-API twins of src/app/app/settings/**\/actions.ts — school
 * profile, classes/sections, subjects, and the academic year/terms. All of it
 * is OFFICE-only desk work; these functions carry the exact same validation
 * and delete-guards as the web actions they mirror, just taking a plain JSON
 * body (and an already-resolved Actor) instead of FormData / relying on
 * requireRole() internally.
 */

type Err = { ok: false; status: number; code: string; message: string };
const err = (status: number, code: string, message: string): Err => ({ ok: false, status, code, message });

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const on = (d: Date | string) =>
  new Date(typeof d === "string" ? `${d}T00:00:00.000Z` : d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/* ------------------------------------------------------------------ */
/* School profile                                                      */
/* ------------------------------------------------------------------ */

export type UpdateSchoolInput = {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  email?: string | null;
  principalName?: string | null;
  udiseCode?: string | null;
  affiliationNo?: string | null;
  upiId?: string | null;
  upiPayeeName?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankIfsc?: string | null;
};

/** Mirrors src/app/app/settings/actions.ts::updateSchool, FormData translated to JSON. */
export async function updateSchoolForActor(
  actor: Actor,
  input: UpdateSchoolInput,
): Promise<Err | { ok: true }> {
  const name = input.name.trim();
  if (name.length < 3) return err(422, "invalid_name", "The school needs a name.");

  const upiId = (input.upiId ?? "").trim();
  if (upiId && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upiId)) {
    return err(422, "invalid_upi", "That UPI ID does not look right. It should look like subhashacademy@sbi.");
  }

  const before = await db.school.findUnique({
    where: { id: actor.schoolId },
    select: { name: true, upiId: true, phone: true, email: true },
  });

  await db.school.update({
    where: { id: actor.schoolId },
    data: {
      name,
      address: (input.address ?? "").trim() || null,
      city: (input.city ?? "").trim() || null,
      state: (input.state ?? "").trim() || null,
      phone: (input.phone ?? "").trim() || null,
      email: (input.email ?? "").trim() || null,
      principalName: (input.principalName ?? "").trim() || null,
      udiseCode: (input.udiseCode ?? "").trim() || null,
      affiliationNo: (input.affiliationNo ?? "").trim() || null,
      upiId: upiId || null,
      upiPayeeName: (input.upiPayeeName ?? "").trim() || null,
      bankName: (input.bankName ?? "").trim() || null,
      bankAccountNo: (input.bankAccountNo ?? "").trim() || null,
      bankIfsc: (input.bankIfsc ?? "").trim().toUpperCase() || null,
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.update",
    entity: "School",
    entityId: actor.schoolId,
    summary: `School details updated${before?.name !== name ? ` — renamed from "${before?.name}"` : ""}`,
    before: before ?? undefined,
    after: { name, upiId },
  });

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Classes & sections                                                  */
/* ------------------------------------------------------------------ */

/** Mirrors src/app/app/settings/classes/actions.ts::createClass. */
export async function createClassForActor(
  actor: Actor,
  input: { name: string },
): Promise<Err | { ok: true; classId: string; name: string }> {
  const existing = await db.class.findMany({ where: { schoolId: actor.schoolId }, select: { name: true } });
  const check = validateClassName(input.name, existing.map((c) => c.name));
  if (!check.allowed) return err(422, "invalid_input", check.reason!);

  const name = tidyClassName(input.name);
  const cls = await db.class.create({
    data: { schoolId: actor.schoolId, name, sequenceOrder: classOrderFor(name) },
    select: { id: true, name: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.class.create",
    entity: "Class",
    entityId: cls.id,
    summary: `Added ${cls.name}`,
  });

  return { ok: true, classId: cls.id, name: cls.name };
}

/** Mirrors src/app/app/settings/classes/actions.ts::renameClass. */
export async function renameClassForActor(
  actor: Actor,
  input: { classId: string; name: string },
): Promise<Err | { ok: true }> {
  const before = await db.class.findFirst({
    where: { id: input.classId, schoolId: actor.schoolId },
    select: { id: true, name: true },
  });
  if (!before) return err(404, "not_found", "That class is not in this school.");

  const others = await db.class.findMany({
    where: { schoolId: actor.schoolId, id: { not: before.id } },
    select: { name: true },
  });
  const check = validateClassName(input.name, others.map((c) => c.name));
  if (!check.allowed) return err(422, "invalid_input", check.reason!);

  const name = tidyClassName(input.name);
  await db.class.update({ where: { id: before.id }, data: { name, sequenceOrder: classOrderFor(name) } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.class.rename",
    entity: "Class",
    entityId: before.id,
    summary: `Renamed ${before.name} to ${name}`,
    before: { name: before.name },
    after: { name },
    reversible: true,
  });

  return { ok: true };
}

/** Mirrors src/app/app/settings/classes/actions.ts::createSection. */
export async function createSectionForActor(
  actor: Actor,
  input: { classId: string; name: string },
): Promise<Err | { ok: true; sectionId: string }> {
  const cls = await db.class.findFirst({
    where: { id: input.classId, schoolId: actor.schoolId },
    select: { id: true, name: true, sections: { select: { name: true } } },
  });
  if (!cls) return err(404, "not_found", "That class is not in this school.");

  const check = validateSectionName(input.name, cls.sections.map((s) => s.name));
  if (!check.allowed) return err(422, "invalid_input", check.reason!);

  const name = tidySectionName(input.name);
  const section = await db.section.create({
    data: { schoolId: actor.schoolId, classId: cls.id, name },
    select: { id: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.section.create",
    entity: "Section",
    entityId: section.id,
    summary: `Added section ${name} to ${cls.name}`,
  });

  return { ok: true, sectionId: section.id };
}

/** Mirrors src/app/app/settings/classes/actions.ts::setClassTeacher. */
export async function setClassTeacherForActor(
  actor: Actor,
  input: { sectionId: string; userId: string | null },
): Promise<Err | { ok: true }> {
  const section = await db.section.findFirst({
    where: { id: input.sectionId, schoolId: actor.schoolId },
    select: {
      id: true,
      name: true,
      classTeacherId: true,
      class: { select: { name: true } },
      classTeacher: { select: { name: true } },
    },
  });
  if (!section) return err(404, "not_found", "That section is not in this school.");

  let teacherName: string | null = null;

  if (input.userId) {
    const [roles, staff, user] = await Promise.all([
      db.schoolRole.findMany({ where: { userId: input.userId, schoolId: actor.schoolId }, select: { role: true } }),
      db.staff.findFirst({ where: { userId: input.userId, schoolId: actor.schoolId }, select: { isActive: true } }),
      db.user.findUnique({ where: { id: input.userId }, select: { name: true } }),
    ]);
    if (roles.length === 0 || !user) return err(404, "user_not_found", "That person is not part of this school.");

    const check = canBeClassTeacher({ isActiveStaff: Boolean(staff?.isActive), roles: roles.map((r) => r.role) });
    if (!check.allowed) return err(422, "invalid_teacher", check.reason!);

    teacherName = user.name;
  }

  await db.section.update({ where: { id: section.id }, data: { classTeacherId: input.userId } });

  const where = `${section.class.name} ${section.name}`;
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.section.classTeacher",
    entity: "Section",
    entityId: section.id,
    summary: teacherName ? `${teacherName} is now class teacher of ${where}` : `Removed the class teacher from ${where}`,
    before: { classTeacher: section.classTeacher?.name ?? null },
    after: { classTeacher: teacherName },
    reversible: true,
  });

  return { ok: true };
}

/** Mirrors src/app/app/settings/classes/actions.ts::deleteSection. */
export async function deleteSectionForActor(
  actor: Actor,
  input: { sectionId: string },
): Promise<Err | { ok: true }> {
  const section = await db.section.findFirst({
    where: { id: input.sectionId, schoolId: actor.schoolId },
    select: {
      id: true,
      name: true,
      class: { select: { name: true } },
      _count: { select: { students: true, attendance: true, timetable: true, homework: true } },
    },
  });
  if (!section) return err(404, "not_found", "That section is not in this school.");

  const check = canDeleteSection({
    students: section._count.students,
    attendance: section._count.attendance,
    timetable: section._count.timetable,
    homework: section._count.homework,
  });
  if (!check.allowed) return err(409, "not_empty", check.reason!);

  await db.section.delete({ where: { id: section.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.section.delete",
    entity: "Section",
    entityId: section.id,
    summary: `Removed the empty section ${section.class.name} ${section.name}`,
  });

  return { ok: true };
}

/** Mirrors src/app/app/settings/classes/actions.ts::deleteClass. */
export async function deleteClassForActor(
  actor: Actor,
  input: { classId: string },
): Promise<Err | { ok: true }> {
  const cls = await db.class.findFirst({
    where: { id: input.classId, schoolId: actor.schoolId },
    select: { id: true, name: true, _count: { select: { students: true, sections: true, subjects: true } } },
  });
  if (!cls) return err(404, "not_found", "That class is not in this school.");

  const check = canDeleteClass({
    students: cls._count.students,
    sections: cls._count.sections,
    subjects: cls._count.subjects,
  });
  if (!check.allowed) return err(409, "not_empty", check.reason!);

  await db.class.delete({ where: { id: cls.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.class.delete",
    entity: "Class",
    entityId: cls.id,
    summary: `Removed the empty class ${cls.name}`,
  });

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Subjects                                                             */
/* ------------------------------------------------------------------ */

export type SubjectFields = { name: string; code?: string | null; isElective?: boolean; isCoScholastic?: boolean };

/** Mirrors src/app/app/settings/subjects/actions.ts::createSubject. */
export async function createSubjectForActor(
  actor: Actor,
  input: SubjectFields & { classId: string },
): Promise<Err | { ok: true; subjectId: string }> {
  const cls = await db.class.findFirst({
    where: { id: input.classId, schoolId: actor.schoolId },
    select: { id: true, name: true, subjects: { select: { name: true } } },
  });
  if (!cls) return err(404, "not_found", "That class is not in this school.");

  const check = validateSubjectName(input.name, cls.subjects.map((s) => s.name));
  if (!check.allowed) return err(422, "invalid_input", check.reason!);

  const name = tidySubjectName(input.name);
  const subject = await db.subject.create({
    data: {
      schoolId: actor.schoolId,
      classId: cls.id,
      name,
      code: input.code?.trim() || null,
      isElective: Boolean(input.isElective),
      isCoScholastic: Boolean(input.isCoScholastic),
    },
    select: { id: true },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.subject.create",
    entity: "Subject",
    entityId: subject.id,
    summary: `Added ${name} to ${cls.name}${input.isCoScholastic ? " as a co-scholastic subject" : ""}`,
  });

  return { ok: true, subjectId: subject.id };
}

/** Mirrors src/app/app/settings/subjects/actions.ts::updateSubject. */
export async function updateSubjectForActor(
  actor: Actor,
  input: SubjectFields & { subjectId: string },
): Promise<Err | { ok: true }> {
  const before = await db.subject.findFirst({
    where: { id: input.subjectId, schoolId: actor.schoolId },
    select: {
      id: true,
      name: true,
      code: true,
      isElective: true,
      isCoScholastic: true,
      classId: true,
      class: { select: { name: true } },
    },
  });
  if (!before) return err(404, "not_found", "That subject is not in this school.");

  const siblings = await db.subject.findMany({
    where: { schoolId: actor.schoolId, classId: before.classId, id: { not: before.id } },
    select: { name: true },
  });
  const check = validateSubjectName(input.name, siblings.map((s) => s.name));
  if (!check.allowed) return err(422, "invalid_input", check.reason!);

  const name = tidySubjectName(input.name);
  await db.subject.update({
    where: { id: before.id },
    data: {
      name,
      code: input.code?.trim() || null,
      isElective: Boolean(input.isElective),
      isCoScholastic: Boolean(input.isCoScholastic),
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.subject.update",
    entity: "Subject",
    entityId: before.id,
    summary: `Changed ${before.name} in ${before.class?.name ?? "the school"}${name !== before.name ? ` to ${name}` : ""}`,
    before: { name: before.name, code: before.code, isElective: before.isElective, isCoScholastic: before.isCoScholastic },
    after: { name, code: input.code ?? null, isElective: Boolean(input.isElective), isCoScholastic: Boolean(input.isCoScholastic) },
    reversible: true,
  });

  return { ok: true };
}

/** Mirrors src/app/app/settings/subjects/actions.ts::deleteSubject. */
export async function deleteSubjectForActor(
  actor: Actor,
  input: { subjectId: string },
): Promise<Err | { ok: true }> {
  const subject = await db.subject.findFirst({
    where: { id: input.subjectId, schoolId: actor.schoolId },
    select: {
      id: true,
      name: true,
      class: { select: { name: true } },
      _count: { select: { exams: true, timetable: true, homework: true, lessonPlans: true } },
    },
  });
  if (!subject) return err(404, "not_found", "That subject is not in this school.");

  const check = canDeleteSubject({
    exams: subject._count.exams,
    timetable: subject._count.timetable,
    homework: subject._count.homework,
    lessonPlans: subject._count.lessonPlans,
  });
  if (!check.allowed) return err(409, "not_empty", check.reason!);

  await db.subject.delete({ where: { id: subject.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.subject.delete",
    entity: "Subject",
    entityId: subject.id,
    summary: `Removed ${subject.name} from ${subject.class?.name ?? "the school"}`,
  });

  return { ok: true };
}

/** Mirrors src/app/app/settings/subjects/actions.ts::setSubjectTeachers. */
export async function setSubjectTeachersForActor(
  actor: Actor,
  input: { subjectId: string; staffIds: string[] },
): Promise<Err | { ok: true }> {
  const subject = await db.subject.findFirst({
    where: { id: input.subjectId, schoolId: actor.schoolId },
    select: { id: true, name: true, class: { select: { name: true } } },
  });
  if (!subject) return err(404, "not_found", "That subject is not in this school.");

  const staff = await db.staff.findMany({
    where: { id: { in: input.staffIds }, schoolId: actor.schoolId, isActive: true },
    select: { id: true, user: { select: { name: true } } },
  });
  if (staff.length !== input.staffIds.length) {
    return err(422, "invalid_staff", "One of those teachers is not active staff at this school.");
  }

  await db.$transaction(async (tx) => {
    await tx.staffSubject.deleteMany({ where: { subjectId: subject.id } });
    if (staff.length > 0) {
      await tx.staffSubject.createMany({
        data: staff.map((s) => ({ staffId: s.id, subjectId: subject.id })),
        skipDuplicates: true,
      });
    }
  });

  const where = `${subject.class?.name ?? "the school"} ${subject.name}`;
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.subject.teachers",
    entity: "Subject",
    entityId: subject.id,
    summary:
      staff.length === 0
        ? `Nobody is now assigned to teach ${where}`
        : `${staff.map((s) => s.user.name).join(", ")} now ${staff.length === 1 ? "teaches" : "teach"} ${where}`,
  });

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Academic year & terms                                               */
/* ------------------------------------------------------------------ */

/** Mirrors src/app/app/settings/year/actions.ts::createAcademicYear. */
export async function createAcademicYearForActor(
  actor: Actor,
  input: { name: string; startDate: string; endDate: string; makeCurrent?: boolean },
): Promise<Err | { ok: true; yearId: string }> {
  if (!isDate(input.startDate) || !isDate(input.endDate)) return err(422, "invalid_date", "Give both dates as dates.");

  const years = await db.academicYear.findMany({ where: { schoolId: actor.schoolId }, select: { name: true } });
  const nameCheck = validateYearName(input.name, years.map((y) => y.name));
  if (!nameCheck.allowed) return err(422, "invalid_name", nameCheck.reason!);

  const dateCheck = validateYearDates(input.startDate, input.endDate);
  if (!dateCheck.allowed) return err(422, "invalid_dates", dateCheck.reason!);

  const name = tidyYearName(input.name);
  const makeCurrent = Boolean(input.makeCurrent) || years.length === 0;

  const year = await db.$transaction(async (tx) => {
    if (makeCurrent) {
      await tx.academicYear.updateMany({ where: { schoolId: actor.schoolId, isCurrent: true }, data: { isCurrent: false } });
    }
    return tx.academicYear.create({
      data: {
        schoolId: actor.schoolId,
        name,
        startDate: new Date(`${input.startDate}T00:00:00.000Z`),
        endDate: new Date(`${input.endDate}T00:00:00.000Z`),
        isCurrent: makeCurrent,
      },
      select: { id: true },
    });
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.year.create",
    entity: "AcademicYear",
    entityId: year.id,
    summary:
      `Created the academic year ${name}, ${on(input.startDate)} to ${on(input.endDate)}` +
      (makeCurrent ? ", and made it the current year" : ""),
  });

  return { ok: true, yearId: year.id };
}

/** Mirrors src/app/app/settings/year/actions.ts::setCurrentYear. */
export async function setCurrentYearForActor(
  actor: Actor,
  input: { yearId: string },
): Promise<Err | { ok: true }> {
  const [next, prev] = await Promise.all([
    db.academicYear.findFirst({ where: { id: input.yearId, schoolId: actor.schoolId }, select: { id: true, name: true, isCurrent: true } }),
    db.academicYear.findFirst({ where: { schoolId: actor.schoolId, isCurrent: true }, select: { id: true, name: true } }),
  ]);
  if (!next) return err(404, "not_found", "That year is not in this school.");
  if (next.isCurrent) return { ok: true };

  await db.$transaction([
    db.academicYear.updateMany({ where: { schoolId: actor.schoolId, isCurrent: true }, data: { isCurrent: false } }),
    db.academicYear.update({ where: { id: next.id }, data: { isCurrent: true } }),
  ]);

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.year.current",
    entity: "AcademicYear",
    entityId: next.id,
    summary: prev
      ? `The school's current year is now ${next.name}, was ${prev.name}. Fees, exams and report cards all follow this.`
      : `The school's current year is now ${next.name}.`,
    before: prev ? { current: prev.name } : undefined,
    after: { current: next.name },
    reversible: true,
  });

  return { ok: true };
}

/** Mirrors src/app/app/settings/year/actions.ts::deleteAcademicYear. */
export async function deleteAcademicYearForActor(
  actor: Actor,
  input: { yearId: string; confirm?: boolean },
): Promise<Err | { ok: true }> {
  const year = await db.academicYear.findFirst({
    where: { id: input.yearId, schoolId: actor.schoolId },
    select: {
      id: true,
      name: true,
      isCurrent: true,
      _count: { select: { invoices: true, structures: true, examTerms: true, enrollments: true } },
    },
  });
  if (!year) return err(404, "not_found", "That year is not in this school.");

  const check = canDeleteYear({
    invoices: year._count.invoices,
    structures: year._count.structures,
    examTerms: year._count.examTerms,
    enrollments: year._count.enrollments,
    isCurrent: year.isCurrent,
  });
  if (!check.allowed) return err(409, "cannot_delete", check.reason!);

  // Deleting cascades the fee structure/exam terms too — the web action shows
  // this sentence and waits for a second click (`confirm: true`) before it
  // deletes; the mobile route asks the same question back to the caller
  // instead of silently proceeding.
  if (check.alsoGoes && !input.confirm) {
    return err(409, "confirmation_required", check.alsoGoes);
  }

  await db.academicYear.delete({ where: { id: year.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.year.delete",
    entity: "AcademicYear",
    entityId: year.id,
    summary: `Removed the academic year ${year.name}. ` + (check.alsoGoes ?? "It had nothing in it."),
  });

  return { ok: true };
}

type StructuresFound = { year: { id: string; name: string; startDate: Date; endDate: Date }; structures: { id: string; class: { name: string } | null }[] };

/** The current year's fee structures — terms hang off these, one copy per class. */
async function structuresOfCurrentYear(schoolId: string): Promise<Err | ({ ok: true } & StructuresFound)> {
  const year = await db.academicYear.findFirst({
    where: { schoolId, isCurrent: true },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  if (!year) return err(404, "no_current_year", "There is no current academic year. Create one first.");

  const structures = await db.feeStructure.findMany({
    where: { schoolId, academicYearId: year.id, isActive: true },
    select: { id: true, class: { select: { name: true } } },
  });
  if (structures.length === 0) {
    return err(
      409,
      "no_fee_structure",
      "No class has fees yet, and a term is attached to a class's fee structure. Price at least one class first.",
    );
  }
  return { ok: true, year, structures };
}

/**
 * Terms always belong to whichever year is current — the web actions never
 * take a yearId at all, they act on `isCurrent: true` directly. The mobile
 * routes are nested under a yearId path segment for REST shape, so this
 * checks the caller's yearId actually is the current year rather than
 * silently acting on a different year than the URL implies.
 */
function assertCurrentYear(yearId: string, year: { id: string; name: string }): Err | null {
  if (year.id !== yearId) {
    return err(409, "not_current_year", `Terms can only be managed for the current academic year (${year.name}).`);
  }
  return null;
}

/** Mirrors src/app/app/settings/year/actions.ts::generateTerms. */
export async function generateTermsForActor(
  actor: Actor,
  input: { yearId: string; count: number },
): Promise<Err | { ok: true; created: number }> {
  const found = await structuresOfCurrentYear(actor.schoolId);
  if (!found.ok) return found;
  const mismatch = assertCurrentYear(input.yearId, found.year);
  if (mismatch) return mismatch;
  const { year, structures } = found;

  const suggested = suggestTerms(year.startDate.toISOString().slice(0, 10), year.endDate.toISOString().slice(0, 10), input.count);
  if (suggested.length === 0) return err(422, "invalid_count", "That is not a number of terms a year can be split into.");

  const existing = new Set(
    (
      await db.installmentPlan.findMany({
        where: { schoolId: actor.schoolId, feeStructureId: { in: structures.map((s) => s.id) } },
        select: { label: true },
      })
    ).map((p) => p.label),
  );
  const fresh = suggested.filter((t) => !existing.has(t.label));
  if (fresh.length === 0) return err(409, "terms_exist", "Those terms already exist in this year.");

  await db.installmentPlan.createMany({
    data: structures.flatMap((s) =>
      fresh.map((t, i) => ({
        schoolId: actor.schoolId,
        feeStructureId: s.id,
        label: t.label,
        dueDate: new Date(`${t.dueDate}T00:00:00.000Z`),
        percentage: Math.round(100 / suggested.length),
        sequenceOrder: existing.size + i,
      })),
    ),
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.term.create",
    entity: "AcademicYear",
    entityId: year.id,
    summary: `${year.name} now has ${fresh.length} ${fresh.length === 1 ? "term" : "terms"}: ${fresh
      .map((t) => t.label)
      .join(", ")} — across all ${structures.length} priced ${structures.length === 1 ? "class" : "classes"}`,
  });

  return { ok: true, created: fresh.length };
}

/** Mirrors src/app/app/settings/year/actions.ts::createTerm. */
export async function createTermForActor(
  actor: Actor,
  input: { yearId: string; label: string; dueDate: string },
): Promise<Err | { ok: true }> {
  if (!isDate(input.dueDate)) return err(422, "invalid_date", "Give the due date as a date.");

  const found = await structuresOfCurrentYear(actor.schoolId);
  if (!found.ok) return found;
  const mismatch = assertCurrentYear(input.yearId, found.year);
  if (mismatch) return mismatch;
  const { year, structures } = found;

  const plans = await db.installmentPlan.findMany({
    where: { schoolId: actor.schoolId, feeStructureId: { in: structures.map((s) => s.id) } },
    select: { label: true, sequenceOrder: true },
  });
  const check = validateTermLabel(input.label, [...new Set(plans.map((p) => p.label))]);
  if (!check.allowed) return err(422, "invalid_input", check.reason!);

  const label = input.label.trim().replace(/\s+/g, " ");
  const order = plans.reduce((a, p) => Math.max(a, p.sequenceOrder), -1) + 1;

  await db.installmentPlan.createMany({
    data: structures.map((s) => ({
      schoolId: actor.schoolId,
      feeStructureId: s.id,
      label,
      dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
      sequenceOrder: order,
    })),
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.term.create",
    entity: "AcademicYear",
    entityId: year.id,
    summary: `Added the term ${label} to ${year.name}, due ${on(input.dueDate)}, for all ${structures.length} priced classes`,
  });

  return { ok: true };
}

/** Mirrors src/app/app/settings/year/actions.ts::renameTerm. */
export async function renameTermForActor(
  actor: Actor,
  input: { from: string; to: string },
): Promise<Err | { ok: true }> {
  const found = await structuresOfCurrentYear(actor.schoolId);
  if (!found.ok) return found;
  const { year, structures } = found;

  const ids = structures.map((s) => s.id);
  const plans = await db.installmentPlan.findMany({
    where: { schoolId: actor.schoolId, feeStructureId: { in: ids } },
    select: { id: true, label: true, _count: { select: { invoices: true } } },
  });
  const mine = plans.filter((p) => p.label === input.from);
  if (mine.length === 0) return err(404, "not_found", `No term in ${year.name} is called ${input.from}.`);

  const others = [...new Set(plans.filter((p) => p.label !== input.from).map((p) => p.label))];
  const check = validateTermLabel(input.to, others);
  if (!check.allowed) return err(422, "invalid_input", check.reason!);

  const label = input.to.trim().replace(/\s+/g, " ");
  const raised = mine.reduce((a, p) => a + p._count.invoices, 0);

  await db.installmentPlan.updateMany({ where: { id: { in: mine.map((p) => p.id) } }, data: { label } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.term.update",
    entity: "AcademicYear",
    entityId: year.id,
    summary:
      `Renamed the term ${input.from} to ${label} in ${year.name}` +
      (raised > 0
        ? `. The ${raised} ${raised === 1 ? "invoice" : "invoices"} already raised keep the old name, because that is what the parent was handed.`
        : "."),
    before: { label: input.from },
    after: { label },
    reversible: true,
  });

  return { ok: true };
}

/** Mirrors src/app/app/settings/year/actions.ts::setTermDueDate. */
export async function setTermDueDateForActor(
  actor: Actor,
  input: { label: string; dueDate: string },
): Promise<Err | { ok: true }> {
  if (!isDate(input.dueDate)) return err(422, "invalid_date", "Give the due date as a date.");

  const found = await structuresOfCurrentYear(actor.schoolId);
  if (!found.ok) return found;
  const { year, structures } = found;

  const where = { schoolId: actor.schoolId, label: input.label, feeStructureId: { in: structures.map((s) => s.id) } };
  const plans = await db.installmentPlan.findMany({ where, select: { id: true, dueDate: true, _count: { select: { invoices: true } } } });
  if (plans.length === 0) return err(404, "not_found", `No term in ${year.name} is called ${input.label}.`);

  const raised = plans.reduce((a, p) => a + p._count.invoices, 0);
  const wasDates = [...new Set(plans.map((p) => p.dueDate.toISOString().slice(0, 10)))];

  await db.installmentPlan.updateMany({ where, data: { dueDate: new Date(`${input.dueDate}T00:00:00.000Z`) } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.term.update",
    entity: "InstallmentPlan",
    entityId: plans[0].id,
    summary:
      `${input.label} is now due ${on(input.dueDate)} for all ${plans.length} classes` +
      (wasDates.length === 1 ? `, was ${on(wasDates[0])}` : `, previously ${wasDates.length} different dates`) +
      (raised > 0 ? `. The ${raised} ${raised === 1 ? "invoice" : "invoices"} already raised keep their own due date.` : "."),
    before: { dueDate: wasDates.join(", "), plans: plans.length },
    after: { dueDate: input.dueDate },
    reversible: wasDates.length === 1,
  });

  return { ok: true };
}

/** Mirrors src/app/app/settings/year/actions.ts::deleteTerm. */
export async function deleteTermForActor(
  actor: Actor,
  input: { label: string },
): Promise<Err | { ok: true }> {
  const found = await structuresOfCurrentYear(actor.schoolId);
  if (!found.ok) return found;
  const { year, structures } = found;

  const plans = await db.installmentPlan.findMany({
    where: { schoolId: actor.schoolId, label: input.label, feeStructureId: { in: structures.map((s) => s.id) } },
    select: { id: true, _count: { select: { invoices: true } } },
  });
  if (plans.length === 0) return err(404, "not_found", `No term in ${year.name} is called ${input.label}.`);

  const check = canDeleteTerm({ invoices: plans.reduce((a, p) => a + p._count.invoices, 0) });
  if (!check.allowed) return err(409, "cannot_delete", check.reason!);

  await db.installmentPlan.deleteMany({ where: { id: { in: plans.map((p) => p.id) } } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.term.delete",
    entity: "AcademicYear",
    entityId: year.id,
    summary: `Removed the term ${input.label} from ${year.name}, which nothing had been billed for`,
  });

  return { ok: true };
}
