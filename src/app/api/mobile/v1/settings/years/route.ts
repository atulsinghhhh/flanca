import { z } from "zod";
import { db } from "@/lib/db";
import { canDeleteTerm, canDeleteYear } from "@/lib/core/year-core";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { createAcademicYearForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/app/app/settings/year/page.tsx. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);

  const years = await db.academicYear.findMany({
    where: { schoolId: actor.schoolId },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isCurrent: true,
      _count: { select: { invoices: true, structures: true, examTerms: true, enrollments: true } },
    },
  });

  const current = years.find((y) => y.isCurrent) ?? null;

  const structures = current
    ? await db.feeStructure.findMany({
        where: { schoolId: actor.schoolId, academicYearId: current.id, isActive: true },
        select: { id: true },
      })
    : [];

  const plans = structures.length
    ? await db.installmentPlan.findMany({
        where: { schoolId: actor.schoolId, feeStructureId: { in: structures.map((s) => s.id) } },
        orderBy: [{ sequenceOrder: "asc" }, { dueDate: "asc" }],
        select: { label: true, dueDate: true, _count: { select: { invoices: true } } },
      })
    : [];

  const yearRows = years.map((y) => {
    const check = canDeleteYear({
      invoices: y._count.invoices,
      structures: y._count.structures,
      examTerms: y._count.examTerms,
      enrollments: y._count.enrollments,
      isCurrent: y.isCurrent,
    });
    return {
      id: y.id,
      name: y.name,
      startDate: y.startDate.toISOString().slice(0, 10),
      endDate: y.endDate.toISOString().slice(0, 10),
      isCurrent: y.isCurrent,
      invoices: y._count.invoices,
      structures: y._count.structures,
      removable: check.allowed,
      whyNot: check.reason,
    };
  });

  // One row per term label, gathering every class's copy of it — same fold
  // year/page.tsx does, because InstallmentPlan has one row per fee structure.
  const byLabel = new Map<string, { dates: string[]; classes: number; invoices: number }>();
  for (const p of plans) {
    const at = byLabel.get(p.label) ?? { dates: [], classes: 0, invoices: 0 };
    at.dates.push(p.dueDate.toISOString().slice(0, 10));
    at.classes += 1;
    at.invoices += p._count.invoices;
    byLabel.set(p.label, at);
  }
  const termRows = [...byLabel.entries()].map(([label, at]) => {
    const check = canDeleteTerm({ invoices: at.invoices });
    return {
      label,
      dueDate: at.dates.sort()[0],
      classes: at.classes,
      mixed: new Set(at.dates).size > 1,
      invoices: at.invoices,
      removable: check.allowed,
      whyNot: check.reason,
    };
  });

  return apiOk({
    years: yearRows,
    currentYearId: current?.id ?? null,
    terms: termRows,
    canHaveTerms: Boolean(current) && structures.length > 0,
  });
});

const Body = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  makeCurrent: z.boolean().optional(),
});

/** Mirrors src/app/app/settings/year/actions.ts::createAcademicYear. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await createAcademicYearForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ yearId: result.yearId }, 201);
});
