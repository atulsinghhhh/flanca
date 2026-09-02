import { z } from "zod";
import { db } from "@/lib/db";
import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { createFeeHeadForActor } from "@/lib/mobile/mutations/fee-structures";
import { canDeleteFeeHead } from "@/lib/core/setup-core";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/**
 * What the school charges: the fee heads, and (for the current academic
 * year) which classes charge how much per head. Mirrors the data behind
 * src/app/app/fees/structures/page.tsx.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);

  const year = await db.academicYear.findFirst({
    where: { schoolId: actor.schoolId, isCurrent: true },
    select: { id: true, name: true },
  });

  const [heads, classes, structures] = await Promise.all([
    db.feeHead.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: [{ sequenceOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { items: true } } },
    }),
    // ACCOUNTANT is MONEY but not OFFICE, so it can't fall back to
    // /settings/classes for names — the class list travels with this response.
    db.class.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { sequenceOrder: "asc" },
      select: { id: true, name: true, _count: { select: { students: true } } },
    }),
    year
      ? db.feeStructure.findMany({
          where: { schoolId: actor.schoolId, isActive: true, academicYearId: year.id },
          select: { classId: true, items: { select: { feeHeadId: true, amount: true } } },
        })
      : Promise.resolve([]),
  ]);

  const classRows = classes.map((c) => ({ id: c.id, name: c.name, students: c._count.students }));

  const headRows = heads.map((h) => {
    const check = canDeleteFeeHead({ items: h._count.items });
    return {
      id: h.id,
      name: h.name,
      code: h.code,
      isOptional: h.isOptional,
      isRefundable: h.isRefundable,
      classesCharging: h._count.items,
      canDelete: check.allowed,
      cannotDeleteReason: check.reason,
    };
  });

  return apiOk({ year, heads: headRows, classes: classRows, structures });
});

const Body = z.object({
  name: z.string().min(1),
  code: z.string().nullable().optional(),
  isOptional: z.boolean().optional(),
  isRefundable: z.boolean().optional(),
});

/** Mirrors createFeeHead. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const input = Body.parse(await req.json());

  const result = await createFeeHeadForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ created: true }, 201);
});
