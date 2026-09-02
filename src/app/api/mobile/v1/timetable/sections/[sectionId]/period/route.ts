import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { setPeriodForActor } from "@/lib/mobile/mutations/timetable";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ sectionId: string }> };

const Body = z.object({
  dayOfWeek: z.number().int().min(1).max(6),
  period: z.number().int().min(1).max(12),
  subjectId: z.string().min(1).nullable(),
  staffId: z.string().min(1).nullable(),
});

/** One period: set its subject and teacher, or clear it. Mirrors src/app/app/timetable/actions.ts::setPeriod. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { sectionId } = await params;
  const body = Body.parse(await req.json());

  const result = await setPeriodForActor(actor, { sectionId, ...body });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ ok: true });
});
