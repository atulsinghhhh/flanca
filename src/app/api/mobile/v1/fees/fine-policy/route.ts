import { z } from "zod";
import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { saveFinePolicyForActor } from "@/lib/mobile/mutations/fee-concessions";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  graceDays: z.number().int().min(0),
  flatAmountText: z.string().nullable().optional(),
  perDayAmountText: z.string().nullable().optional(),
  maxAmountText: z.string().nullable().optional(),
  isActive: z.boolean(),
});

/** Mirrors saveFinePolicy — what the school charges for paying late. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const input = Body.parse(await req.json());

  const result = await saveFinePolicyForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ saved: true, messages: result.messages });
});
