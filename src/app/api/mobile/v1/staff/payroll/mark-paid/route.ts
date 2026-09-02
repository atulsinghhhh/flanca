import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { markSalariesPaidForActor } from "@/lib/mobile/mutations/staff";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int(),
  mode: z.string().min(1),
});

/** Mirrors src/app/app/staff/actions.ts::markSalariesPaid. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await markSalariesPaidForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ count: result.count });
});
