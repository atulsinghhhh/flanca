import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { issueLoginsForActor } from "@/lib/mobile/mutations/students";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({ classId: z.string().nullable() });

/** Mirrors src/app/app/students/logins/actions.ts::issueLogins. Each returned code is shown exactly once. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { classId } = Body.parse(await req.json());

  const result = await issueLoginsForActor(actor, classId);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ slips: result.slips, skipped: result.skipped, label: result.label });
});
