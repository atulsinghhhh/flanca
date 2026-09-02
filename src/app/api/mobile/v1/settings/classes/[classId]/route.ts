import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { renameClassForActor, deleteClassForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ classId: string }> };

const Body = z.object({ name: z.string().min(1) });

/** Mirrors src/app/app/settings/classes/actions.ts::renameClass. */
export const PATCH = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { classId } = await params;
  const { name } = Body.parse(await req.json());

  const result = await renameClassForActor(actor, { classId, name });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ updated: true });
});

/** Mirrors src/app/app/settings/classes/actions.ts::deleteClass. */
export const DELETE = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { classId } = await params;

  const result = await deleteClassForActor(actor, { classId });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ deleted: true });
});
