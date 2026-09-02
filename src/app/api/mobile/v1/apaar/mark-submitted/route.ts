import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { markSubmittedForActor } from "@/lib/mobile/mutations/apaar";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  studentIds: z.array(z.string().min(1)).min(1),
});

/** Mirrors src/app/app/apaar/actions.ts::markSubmitted. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await markSubmittedForActor(actor, input.studentIds);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ count: result.count });
});
