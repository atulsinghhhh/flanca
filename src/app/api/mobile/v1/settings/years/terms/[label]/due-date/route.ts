import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { setTermDueDateForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ label: string }> };

const Body = z.object({ dueDate: z.string().min(1) });

/** Mirrors src/app/app/settings/year/actions.ts::setTermDueDate. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { label: raw } = await params;
  const label = decodeURIComponent(raw);
  const { dueDate } = Body.parse(await req.json());

  const result = await setTermDueDateForActor(actor, { label, dueDate });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ updated: true });
});
