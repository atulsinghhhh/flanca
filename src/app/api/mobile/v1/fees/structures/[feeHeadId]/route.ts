import { z } from "zod";
import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { updateFeeHeadForActor, deleteFeeHeadForActor } from "@/lib/mobile/mutations/fee-structures";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ feeHeadId: string }> };

const Body = z.object({
  name: z.string().min(1),
  code: z.string().nullable().optional(),
  isOptional: z.boolean().optional(),
  isRefundable: z.boolean().optional(),
});

/** Mirrors updateFeeHead. */
export const PATCH = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const { feeHeadId } = await params;
  const body = Body.parse(await req.json());

  const result = await updateFeeHeadForActor(actor, { feeHeadId, ...body });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ updated: true });
});

/** Mirrors deleteFeeHead. */
export const DELETE = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const { feeHeadId } = await params;

  const result = await deleteFeeHeadForActor(actor, { feeHeadId });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ deleted: true });
});
