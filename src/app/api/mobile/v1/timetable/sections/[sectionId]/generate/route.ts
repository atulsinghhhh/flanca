import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { generateWeekForActor } from "@/lib/mobile/mutations/timetable";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ sectionId: string }> };

const Body = z.object({
  periodsPerDay: z.number().int().min(1).max(12).optional(),
});

/** Build a section's whole week at once. Mirrors src/app/app/timetable/actions.ts::generateWeek. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { sectionId } = await params;
  const body = Body.parse(await req.json().catch(() => ({})));

  const result = await generateWeekForActor(actor, { sectionId, ...body });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ placed: result.placed, free: result.free });
});
