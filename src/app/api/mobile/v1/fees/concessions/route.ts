import { z } from "zod";
import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { grantConcessionForActor } from "@/lib/mobile/mutations/fee-concessions";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  studentId: z.string().min(1),
  concessionTypeId: z.string().min(1),
  percentage: z.number().nullable().optional(),
  fixedAmountText: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  approveNow: z.boolean().optional(),
});

/** Mirrors grantConcession — giving a child a concession. Recording it is not the same as approving it. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const input = Body.parse(await req.json());

  const result = await grantConcessionForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ concessionId: result.concessionId, approved: result.approved }, 201);
});
