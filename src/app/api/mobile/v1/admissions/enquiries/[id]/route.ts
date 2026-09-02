import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { updateEnquiryForActor } from "@/lib/mobile/mutations/admissions";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

const UpdateEnquiryBody = z.object({
  status: z.enum(["NEW", "CONTACTED", "VISITED", "CONVERTED", "LOST"]),
  notes: z.string().optional(),
});

/** Mirrors src/app/app/admissions/actions.ts::updateEnquiry. */
export const PATCH = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { id } = await params;
  const input = UpdateEnquiryBody.parse(await req.json());

  const result = await updateEnquiryForActor(actor, id, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ updated: true });
});
