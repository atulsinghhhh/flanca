import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { setThreadClosedForActor } from "@/lib/mobile/mutations/chat";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ threadId: string }> };

const Body = z.object({ closed: z.boolean() });

/** Mirrors src/app/app/chat/actions.ts::setThreadClosed. Office-only. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { threadId } = await params;
  const { closed } = Body.parse(await req.json());

  const result = await setThreadClosedForActor(actor, { threadId, closed });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ ok: true });
});
