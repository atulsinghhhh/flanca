import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { enrolApplicantForActor } from "@/lib/mobile/mutations/admissions";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

const EnrolApplicantBody = z.object({
  classId: z.string().min(1),
});

/** Mirrors src/app/app/admissions/actions.ts::enrolApplicant. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { id } = await params;
  const input = EnrolApplicantBody.parse(await req.json());

  const result = await enrolApplicantForActor(actor, id, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ studentId: result.studentId, admissionNumber: result.admissionNumber }, 201);
});
