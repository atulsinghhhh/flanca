import { z } from "zod";
import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { raiseTermInvoicesForActor } from "@/lib/mobile/mutations/fees";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  label: z.string().min(1),
  expectedCount: z.number().int().min(0),
});

/** Mirrors src/app/app/fees/raise/actions.ts::raiseTermInvoices. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const input = Body.parse(await req.json());

  const result = await raiseTermInvoicesForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ raised: result.raised, net: result.net });
});
