import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { setStaffActiveForActor } from "@/lib/mobile/mutations/staff";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

const Body = z.object({ isActive: z.boolean() });

/** Mirrors src/app/app/staff/people-actions.ts::setStaffActive. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { id } = await params;
  const input = Body.parse(await req.json());

  const result = await setStaffActiveForActor(actor, { staffId: id, isActive: input.isActive });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ ok: true });
});
