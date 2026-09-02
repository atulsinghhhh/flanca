import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { revokeConcessionForActor } from "@/lib/mobile/mutations/fee-concessions";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

const Body = z.object({ reason: z.string().min(1) });

/** Mirrors revokeConcession — OFFICE, not MONEY. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { id } = await params;
  const { reason } = Body.parse(await req.json());

  const result = await revokeConcessionForActor(actor, { concessionId: id, reason });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ revoked: true });
});
