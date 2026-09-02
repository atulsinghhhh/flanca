import { z } from "zod";
import { requireMobileActor } from "@/lib/mobile/session";
import { postMessageForActor } from "@/lib/mobile/mutations/chat";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ threadId: string }> };

const Body = z.object({ body: z.string() });

/** Mirrors src/app/app/chat/actions.ts::postMessage. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileActor(req);
  const { threadId } = await params;
  const { body } = Body.parse(await req.json());

  const result = await postMessageForActor(actor, { threadId, body });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ ok: true });
});
