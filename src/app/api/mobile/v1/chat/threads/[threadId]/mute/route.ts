import { z } from "zod";
import { requireMobileActor } from "@/lib/mobile/session";
import { setThreadMutedForActor } from "@/lib/mobile/mutations/chat";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ threadId: string }> };

const Body = z.object({ muted: z.boolean() });

/** Mirrors src/app/app/chat/actions.ts::setThreadMuted. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileActor(req);
  const { threadId } = await params;
  const { muted } = Body.parse(await req.json());

  const result = await setThreadMutedForActor(actor, { threadId, muted });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ ok: true });
});
