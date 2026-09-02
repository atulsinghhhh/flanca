import { z } from "zod";
import { requireMobileRole } from "@/lib/mobile/session";
import { bookSlotForActor } from "@/lib/mobile/mutations/ptm";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ slotId: string }> };

const Body = z.object({ studentId: z.string().min(1) });

/** Mirrors src/app/app/ptm/actions.ts::bookSlot — a parent booking one slot for one of their own children. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, "PARENT");
  const { slotId } = await params;
  const { studentId } = Body.parse(await req.json());

  const result = await bookSlotForActor(actor, { slotId, studentId });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ booked: true });
});
