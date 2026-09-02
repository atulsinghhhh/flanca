import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { setClassTeacherForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ sectionId: string }> };

const Body = z.object({ userId: z.string().min(1).nullable() });

/** Mirrors src/app/app/settings/classes/actions.ts::setClassTeacher. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { sectionId } = await params;
  const { userId } = Body.parse(await req.json());

  const result = await setClassTeacherForActor(actor, { sectionId, userId });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ updated: true });
});
