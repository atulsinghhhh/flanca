import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { createSectionForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ classId: string }> };

const Body = z.object({ name: z.string().min(1) });

/** Mirrors src/app/app/settings/classes/actions.ts::createSection. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { classId } = await params;
  const { name } = Body.parse(await req.json());

  const result = await createSectionForActor(actor, { classId, name });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ sectionId: result.sectionId }, 201);
});
