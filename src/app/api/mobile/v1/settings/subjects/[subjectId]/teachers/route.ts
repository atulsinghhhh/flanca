import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { setSubjectTeachersForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ subjectId: string }> };

const Body = z.object({ staffIds: z.array(z.string().min(1)) });

/** Mirrors src/app/app/settings/subjects/actions.ts::setSubjectTeachers. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { subjectId } = await params;
  const { staffIds } = Body.parse(await req.json());

  const result = await setSubjectTeachersForActor(actor, { subjectId, staffIds });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ updated: true });
});
