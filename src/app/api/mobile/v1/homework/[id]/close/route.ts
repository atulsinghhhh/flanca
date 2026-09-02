import { requireMobileRole, TEACHING } from "@/lib/mobile/session";
import { closeHomeworkForActor } from "@/lib/mobile/mutations/homework";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

/** Mirrors src/app/app/homework/actions.ts::closeHomework. ASSIGNED → CLOSED. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const { id } = await params;

  const result = await closeHomeworkForActor(actor, id);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ ok: true });
});
