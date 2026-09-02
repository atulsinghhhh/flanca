import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { updateSubjectForActor, deleteSubjectForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ subjectId: string }> };

const Body = z.object({
  name: z.string().min(1),
  code: z.string().nullish(),
  isElective: z.boolean().optional(),
  isCoScholastic: z.boolean().optional(),
});

/** Mirrors src/app/app/settings/subjects/actions.ts::updateSubject. */
export const PATCH = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { subjectId } = await params;
  const input = Body.parse(await req.json());

  const result = await updateSubjectForActor(actor, { subjectId, ...input });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ updated: true });
});

/** Mirrors src/app/app/settings/subjects/actions.ts::deleteSubject. */
export const DELETE = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { subjectId } = await params;

  const result = await deleteSubjectForActor(actor, { subjectId });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ deleted: true });
});
