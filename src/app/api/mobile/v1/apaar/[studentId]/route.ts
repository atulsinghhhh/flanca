import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { updateApaarForActor } from "@/lib/mobile/mutations/apaar";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ studentId: string }> };

const Body = z.object({
  apaarId: z.string().optional(),
  penNumber: z.string().optional(),
  aadhaarName: z.string().optional(),
  status: z.string().optional(),
  note: z.string().optional(),
});

/** Mirrors src/app/app/apaar/actions.ts::updateApaar. */
export const PATCH = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { studentId } = await params;
  const input = Body.parse(await req.json());

  const result = await updateApaarForActor(actor, { studentId, ...input });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ ok: true });
});
