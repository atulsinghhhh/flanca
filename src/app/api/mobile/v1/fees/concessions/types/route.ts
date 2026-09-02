import { z } from "zod";
import { db } from "@/lib/db";
import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { createConcessionTypeForActor } from "@/lib/mobile/mutations/fee-concessions";
import { canDeleteConcessionType } from "@/lib/core/concession-core";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors the list behind src/app/app/fees/concessions/page.tsx. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);

  const types = await db.concessionType.findMany({
    where: { schoolId: actor.schoolId },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, percentage: true, fixedAmount: true, appliesToHeads: true,
      requiresApproval: true, _count: { select: { concessions: true } },
    },
  });

  const rows = types.map((t) => {
    const guard = canDeleteConcessionType({ students: t._count.concessions });
    return {
      id: t.id,
      name: t.name,
      percentage: t.percentage,
      fixedAmount: t.fixedAmount,
      appliesToHeads: t.appliesToHeads,
      requiresApproval: t.requiresApproval,
      studentsOn: t._count.concessions,
      canDelete: guard.allowed,
      cannotDeleteReason: guard.reason,
    };
  });

  return apiOk({ types: rows });
});

const Body = z.object({
  name: z.string().min(1),
  percentage: z.number().nullable().optional(),
  fixedAmountText: z.string().nullable().optional(),
  appliesToHeads: z.array(z.string()).nullable().optional(),
  requiresApproval: z.boolean().optional(),
});

/** Mirrors createConcessionType. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const input = Body.parse(await req.json());

  const result = await createConcessionTypeForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ concessionTypeId: result.concessionTypeId, messages: result.messages }, 201);
});
