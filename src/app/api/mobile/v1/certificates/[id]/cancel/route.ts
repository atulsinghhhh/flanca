import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { cancelCertificateForActor } from "@/lib/mobile/mutations/certificates";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

const Body = z.object({
  reason: z.string().min(1),
});

/** Mirrors src/app/app/certificates/actions.ts::cancelCertificate — the serial is never reused. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { id } = await params;
  const input = Body.parse(await req.json());

  const result = await cancelCertificateForActor(actor, id, input.reason);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ cancelled: true });
});
