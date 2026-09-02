import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { getImportBatchForActor } from "@/lib/mobile/mutations/import";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

/** Mirrors src/app/app/import/[id]/page.tsx: the batch plus rows needing a look and clean rows. */
export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const { id } = await params;

  const result = await getImportBatchForActor(actor, id);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ batch: result.batch, problemRows: result.problemRows, cleanRows: result.cleanRows });
});
