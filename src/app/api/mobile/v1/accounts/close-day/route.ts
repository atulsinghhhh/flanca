import { z } from "zod";
import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { closeTheDayForActor } from "@/lib/mobile/mutations/accounts";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  date: z.string().min(1),
  cashCounted: z.number(),
  note: z.string().optional(),
});

/** Mirrors src/app/app/fees/actions.ts::closeTheDay — the daily cash closeout. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const input = Body.parse(await req.json());

  const result = await closeTheDayForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ variance: result.variance, cashExpected: result.cashExpected });
});
