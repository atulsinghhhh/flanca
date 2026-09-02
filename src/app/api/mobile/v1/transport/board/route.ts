import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { boardStudentForActor } from "@/lib/mobile/mutations/transport";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  studentId: z.string().min(1),
  routeId: z.string().min(1),
  stopId: z.string().min(1).optional().nullable(),
  fromIso: z.string().optional().nullable(),
});

/** Put a child on a bus, at a stop, from a date. Mirrors src/app/app/transport/actions.ts::boardStudent. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await boardStudentForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ ok: true }, 201);
});
