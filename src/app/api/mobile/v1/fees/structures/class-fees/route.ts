import { z } from "zod";
import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { setClassFeesForActor } from "@/lib/mobile/mutations/fee-structures";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  classId: z.string().min(1),
  amounts: z.record(z.string(), z.string()),
});

/** Mirrors setClassFees — what one class pays, head by head, for the year. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const input = Body.parse(await req.json());

  const result = await setClassFeesForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ saved: true });
});
