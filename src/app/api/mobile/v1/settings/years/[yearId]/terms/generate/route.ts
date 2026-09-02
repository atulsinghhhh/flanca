import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { generateTermsForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ yearId: string }> };

const Body = z.object({ count: z.number().int().min(1).max(12) });

/** Mirrors src/app/app/settings/year/actions.ts::generateTerms. Same current-year check as terms/route.ts. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { yearId } = await params;
  const { count } = Body.parse(await req.json());

  const result = await generateTermsForActor(actor, { yearId, count });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ created: result.created }, 201);
});
