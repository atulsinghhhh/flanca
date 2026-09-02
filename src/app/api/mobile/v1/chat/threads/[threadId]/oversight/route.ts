import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { openWithOversightForActor } from "@/lib/mobile/mutations/chat";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ threadId: string }> };

/** Mirrors src/app/app/chat/actions.ts::openWithOversight. Office-only, and audited. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { threadId } = await params;

  const result = await openWithOversightForActor(actor, { threadId });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ messages: result.messages });
});
