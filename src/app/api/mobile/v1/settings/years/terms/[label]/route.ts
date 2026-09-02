import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { renameTermForActor, deleteTermForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/**
 * A term has no id of its own — src/app/app/settings/year/actions.ts keeps
 * one InstallmentPlan row per priced class and addresses all of them by
 * their shared `label` (e.g. "Term 1 (Apr–Jun)") — so `[label]` here plays
 * the role the task brief calls `[termId]`. Same convention already used by
 * src/app/api/mobile/v1/exams/terms/[termName]/route.ts.
 */
type RouteCtx = { params: Promise<{ label: string }> };

const Body = z.object({ to: z.string().min(1) });

/** Mirrors src/app/app/settings/year/actions.ts::renameTerm. */
export const PATCH = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { label: raw } = await params;
  const from = decodeURIComponent(raw);
  const { to } = Body.parse(await req.json());

  const result = await renameTermForActor(actor, { from, to });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ updated: true });
});

/** Mirrors src/app/app/settings/year/actions.ts::deleteTerm. */
export const DELETE = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { label: raw } = await params;
  const label = decodeURIComponent(raw);

  const result = await deleteTermForActor(actor, { label });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ deleted: true });
});
