import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { previewLoginsForActor } from "@/lib/mobile/mutations/students";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/app/app/students/logins/actions.ts::previewLogins. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const classId = new URL(req.url).searchParams.get("classId") || null;

  const result = await previewLoginsForActor(actor, classId);
  return apiOk({
    plan: result.plan,
    domain: result.domain,
    deliverable: result.deliverable,
    label: result.label,
  });
});
