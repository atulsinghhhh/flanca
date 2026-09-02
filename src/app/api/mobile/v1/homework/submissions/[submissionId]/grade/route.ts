import { z } from "zod";
import { requireMobileRole, TEACHING } from "@/lib/mobile/session";
import { gradeSubmissionForActor } from "@/lib/mobile/mutations/homework";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ submissionId: string }> };

const Body = z.object({
  marks: z.number().optional().nullable(),
  feedback: z.string().optional().nullable(),
});

/** Mirrors src/app/app/homework/actions.ts::gradeSubmission. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const { submissionId } = await params;
  const input = Body.parse(await req.json());

  const result = await gradeSubmissionForActor(actor, submissionId, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ ok: true });
});
