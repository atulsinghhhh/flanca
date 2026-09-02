import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { allotBedForActor } from "@/lib/mobile/mutations/hostel";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  studentId: z.string().min(1),
  roomId: z.string().min(1),
  bedNo: z.string().optional().nullable(),
  fromIso: z.string().optional().nullable(),
});

/** Mirrors src/app/app/hostel/actions.ts::allotBed — a warden giving a child a bed. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await allotBedForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ ok: true }, 201);
});
