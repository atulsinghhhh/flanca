"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";
import {
  canDeleteTerm, canDeleteYear, suggestTerms, tidyYearName,
  validateTermLabel, validateYearDates, validateYearName,
} from "@/lib/core/year-core";

/**
 * The academic year, and the terms inside it.
 *
 * A school that signed up on Monday had a school, a login, and no year — and
 * everything that matters hangs off one: fee structures, invoices, exam terms,
 * report cards, enrolments. The seed was the only thing that had ever created one.
 *
 * Terms are attached to a class's fee structure in the schema, not to the year, so
 * they can only be created once at least one class has fees. That ordering is real
 * and the refusals say so rather than failing quietly.
 */

const on = (d: Date | string) =>
  new Date(typeof d === "string" ? `${d}T00:00:00.000Z` : d).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function createAcademicYear(input: {
  name: string;
  startDate: string;
  endDate: string;
  makeCurrent?: boolean;
}) {
  const actor = await requireRole(...OFFICE);

  if (!isDate(input.startDate) || !isDate(input.endDate)) return { error: "Give both dates as dates." };

  const years = await db.academicYear.findMany({
    where: { schoolId: actor.schoolId },
    select: { name: true },
  });
  const nameCheck = validateYearName(input.name, years.map((y) => y.name));
  if (!nameCheck.allowed) return { error: nameCheck.reason! };

  const dateCheck = validateYearDates(input.startDate, input.endDate);
  if (!dateCheck.allowed) return { error: dateCheck.reason! };

  const name = tidyYearName(input.name);
  const makeCurrent = Boolean(input.makeCurrent) || years.length === 0;

  const year = await db.$transaction(async (tx) => {
    if (makeCurrent) {
      // Exactly one year is current. Two would make every "this year" query in the
      // product pick one at random.
      await tx.academicYear.updateMany({
        where: { schoolId: actor.schoolId, isCurrent: true },
        data: { isCurrent: false },
      });
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

  revalidatePath("/app/settings/year");
  revalidatePath("/app");
  return { ok: true as const, yearId: year.id };
}

/**
 * Which year the school is in.
 *
 * This is the single most far-reaching switch in the product — the fee structure,
 * the invoices, the exam terms and every report card follow it — so it is audited
 * with both names in the sentence.
 */
export async function setCurrentYear(input: { yearId: string }) {
  const actor = await requireRole(...OFFICE);

  const [next, prev] = await Promise.all([
    db.academicYear.findFirst({
      where: { id: input.yearId, schoolId: actor.schoolId },
      select: { id: true, name: true, isCurrent: true },
    }),
    db.academicYear.findFirst({
      where: { schoolId: actor.schoolId, isCurrent: true },
      select: { id: true, name: true },
    }),
  ]);
  if (!next) return { error: "That year is not in this school." };
  if (next.isCurrent) return { ok: true as const };

  await db.$transaction([
    db.academicYear.updateMany({
      where: { schoolId: actor.schoolId, isCurrent: true },
      data: { isCurrent: false },
    }),
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

  revalidatePath("/app/settings/year");
  revalidatePath("/app");
  return { ok: true as const };
}

export async function deleteAcademicYear(input: { yearId: string; confirm?: boolean }) {
  const actor = await requireRole(...OFFICE);

  const year = await db.academicYear.findFirst({
    where: { id: input.yearId, schoolId: actor.schoolId },
    select: {
      id: true, name: true, isCurrent: true,
      _count: { select: { invoices: true, structures: true, examTerms: true, enrollments: true } },
    },
  });
  if (!year) return { error: "That year is not in this school." };

  const check = canDeleteYear({
    invoices: year._count.invoices,
    structures: year._count.structures,
    examTerms: year._count.examTerms,
    enrollments: year._count.enrollments,
    isCurrent: year.isCurrent,
  });
  if (!check.allowed) return { error: check.reason! };

  // Removing a year takes its fee structure, its terms and its exam terms with it —
  // Prisma cascades them. Nothing was billed from any of it, but a school should read
  // that sentence before the click rather than after.
  if (check.alsoGoes && !input.confirm) return { confirm: check.alsoGoes };

  await db.academicYear.delete({ where: { id: year.id } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.year.delete",
    entity: "AcademicYear",
    entityId: year.id,
    summary:
      `Removed the academic year ${year.name}. ` +
      (check.alsoGoes ?? "It had nothing in it."),
  });

  revalidatePath("/app/settings/year");
  revalidatePath("/app");
  return { ok: true as const };
}

/** The current year's fee structures — terms hang off these, one copy per class. */
async function structuresOfCurrentYear(schoolId: string) {
  const year = await db.academicYear.findFirst({
    where: { schoolId, isCurrent: true },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  if (!year) return { error: "There is no current academic year. Create one first." as const };

  const structures = await db.feeStructure.findMany({
    where: { schoolId, academicYearId: year.id, isActive: true },
    select: { id: true, class: { select: { name: true } } },
  });
  if (structures.length === 0) {
    return {
      error:
        "No class has fees yet, and a term is attached to a class's fee structure. Price at least one class first." as const,
    };
  }
  return { year, structures };
}

/**
 * Create the year's terms in one go — four quarters, two halves, twelve months.
 *
 * A school picks a number rather than typing a label and a date twelve times, and
 * can then edit any of them. Labels already in use are left alone, so running this
 * twice does not duplicate a term or move a due date somebody has since corrected.
 */
export async function generateTerms(input: { count: number }) {
  const actor = await requireRole(...OFFICE);
  const found = await structuresOfCurrentYear(actor.schoolId);
  if ("error" in found) return { error: found.error };
  const { year, structures } = found;

  const suggested = suggestTerms(
    year.startDate.toISOString().slice(0, 10),
    year.endDate.toISOString().slice(0, 10),
    input.count,
  );
  if (suggested.length === 0) return { error: "That is not a number of terms a year can be split into." };

  const existing = new Set(
    (
      await db.installmentPlan.findMany({
        where: { schoolId: actor.schoolId, feeStructureId: { in: structures.map((s) => s.id) } },
        select: { label: true },
      })
    ).map((p) => p.label),
  );
  const fresh = suggested.filter((t) => !existing.has(t.label));
  if (fresh.length === 0) return { error: "Those terms already exist in this year." };

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

  revalidatePath("/app/settings/year");
  revalidatePath("/app/fees/structures");
  revalidatePath("/app/fees/raise");
  return { ok: true as const, created: fresh.length };
}

export async function createTerm(input: { label: string; dueDate: string }) {
  const actor = await requireRole(...OFFICE);
  if (!isDate(input.dueDate)) return { error: "Give the due date as a date." };

  const found = await structuresOfCurrentYear(actor.schoolId);
  if ("error" in found) return { error: found.error };
  const { year, structures } = found;

  const plans = await db.installmentPlan.findMany({
    where: { schoolId: actor.schoolId, feeStructureId: { in: structures.map((s) => s.id) } },
    select: { label: true, sequenceOrder: true },
  });
  const check = validateTermLabel(input.label, [...new Set(plans.map((p) => p.label))]);
  if (!check.allowed) return { error: check.reason! };

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

  revalidatePath("/app/settings/year");
  revalidatePath("/app/fees/structures");
  return { ok: true as const };
}

/**
 * Rename a term. It shows on every invoice raised for it from now on — and on the
 * ones already raised, which carry the label they were raised with, so the two can
 * disagree. The audit line says so.
 */
export async function renameTerm(input: { from: string; to: string }) {
  const actor = await requireRole(...OFFICE);

  const found = await structuresOfCurrentYear(actor.schoolId);
  if ("error" in found) return { error: found.error };
  const { year, structures } = found;

  const ids = structures.map((s) => s.id);
  const plans = await db.installmentPlan.findMany({
    where: { schoolId: actor.schoolId, feeStructureId: { in: ids } },
    select: { id: true, label: true, _count: { select: { invoices: true } } },
  });
  const mine = plans.filter((p) => p.label === input.from);
  if (mine.length === 0) return { error: `No term in ${year.name} is called ${input.from}.` };

  const others = [...new Set(plans.filter((p) => p.label !== input.from).map((p) => p.label))];
  const check = validateTermLabel(input.to, others);
  if (!check.allowed) return { error: check.reason! };

  const label = input.to.trim().replace(/\s+/g, " ");
  const raised = mine.reduce((a, p) => a + p._count.invoices, 0);

  await db.installmentPlan.updateMany({
    where: { id: { in: mine.map((p) => p.id) } },
    data: { label },
  });

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

  revalidatePath("/app/settings/year");
  revalidatePath("/app/fees/structures");
  return { ok: true as const };
}

/**
 * When a term falls due, for every class at once.
 *
 * The schema keeps an InstallmentPlan per fee structure — thirteen copies of Term 2
 * in the seeded school — but a school has one Term 2. Editing one class's copy and
 * leaving twelve behind is the mistake this shape invites, so this works by label.
 */
export async function setTermDueDate(input: { label: string; dueDate: string }) {
  const actor = await requireRole(...OFFICE);
  if (!isDate(input.dueDate)) return { error: "Give the due date as a date." };

  const found = await structuresOfCurrentYear(actor.schoolId);
  if ("error" in found) return { error: found.error };
  const { year, structures } = found;

  const where = {
    schoolId: actor.schoolId,
    label: input.label,
    feeStructureId: { in: structures.map((s) => s.id) },
  };
  const plans = await db.installmentPlan.findMany({
    where,
    select: { id: true, dueDate: true, _count: { select: { invoices: true } } },
  });
  if (plans.length === 0) return { error: `No term in ${year.name} is called ${input.label}.` };

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
      (raised > 0
        ? `. The ${raised} ${raised === 1 ? "invoice" : "invoices"} already raised keep their own due date.`
        : "."),
    before: { dueDate: wasDates.join(", "), plans: plans.length },
    after: { dueDate: input.dueDate },
    reversible: wasDates.length === 1,
  });

  revalidatePath("/app/settings/year");
  revalidatePath("/app/fees/structures");
  revalidatePath("/app/fees/raise");
  return { ok: true as const };
}

export async function deleteTerm(input: { label: string }) {
  const actor = await requireRole(...OFFICE);

  const found = await structuresOfCurrentYear(actor.schoolId);
  if ("error" in found) return { error: found.error };
  const { year, structures } = found;

  const plans = await db.installmentPlan.findMany({
    where: { schoolId: actor.schoolId, label: input.label, feeStructureId: { in: structures.map((s) => s.id) } },
    select: { id: true, _count: { select: { invoices: true } } },
  });
  if (plans.length === 0) return { error: `No term in ${year.name} is called ${input.label}.` };

  const check = canDeleteTerm({ invoices: plans.reduce((a, p) => a + p._count.invoices, 0) });
  if (!check.allowed) return { error: check.reason! };

  await db.installmentPlan.deleteMany({ where: { id: { in: plans.map((p) => p.id) } } });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "school.term.delete",
    entity: "AcademicYear",
    entityId: year.id,
    summary: `Removed the term ${input.label} from ${year.name}, which nothing had been billed for`,
  });

  revalidatePath("/app/settings/year");
  revalidatePath("/app/fees/structures");
  return { ok: true as const };
}
