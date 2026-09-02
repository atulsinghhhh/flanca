import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { createTermForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ yearId: string }> };

const Body = z.object({ label: z.string().min(1), dueDate: z.string().min(1) });

/**
 * Mirrors src/app/app/settings/year/actions.ts::createTerm. The web action
 * always acts on whichever academic year is current — it takes no yearId —
 * so this route checks the yearId in the URL actually is the current year
 * rather than silently acting on a different one (see assertCurrentYear in
 * src/lib/mobile/mutations/settings.ts).
 */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { yearId } = await params;
  const { label, dueDate } = Body.parse(await req.json());

  const result = await createTermForActor(actor, { yearId, label, dueDate });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ created: true }, 201);
});
