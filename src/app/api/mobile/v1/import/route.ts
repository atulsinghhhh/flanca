import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { listImportBatchesForActor } from "@/lib/mobile/mutations/import";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors the import-history table on src/app/app/import/page.tsx. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);

  const limitParam = new URL(req.url).searchParams.get("limit");
  const limit = limitParam ? Math.min(50, Math.max(1, Number(limitParam) || 20)) : 20;

  const result = await listImportBatchesForActor(actor, limit);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ batches: result.batches });
});
