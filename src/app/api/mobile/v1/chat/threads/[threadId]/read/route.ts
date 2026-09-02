import { requireMobileActor } from "@/lib/mobile/session";
import { markThreadReadForActor } from "@/lib/mobile/mutations/chat";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ threadId: string }> };

/** Mirrors src/app/app/chat/actions.ts::markThreadRead. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileActor(req);
  const { threadId } = await params;

  const result = await markThreadReadForActor(actor, { threadId });
  return apiOk(result);
});
