import { z } from "zod";
import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { updateConcessionTypeForActor, deleteConcessionTypeForActor } from "@/lib/mobile/mutations/fee-concessions";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().min(1),
  percentage: z.number().nullable().optional(),
  fixedAmountText: z.string().nullable().optional(),
  appliesToHeads: z.array(z.string()).nullable().optional(),
  requiresApproval: z.boolean().optional(),
});

/** Mirrors updateConcessionType. */
export const PATCH = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const { id } = await params;
  const body = Body.parse(await req.json());

  const result = await updateConcessionTypeForActor(actor, { concessionTypeId: id, ...body });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ updated: true, messages: result.messages });
});

/** Mirrors deleteConcessionType. */
export const DELETE = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const { id } = await params;

  const result = await deleteConcessionTypeForActor(actor, { concessionTypeId: id });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ deleted: true });
});
