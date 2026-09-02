import { z } from "zod";
import { db } from "@/lib/db";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { updateSchoolForActor } from "@/lib/mobile/mutations/settings";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/app/app/settings/page.tsx's school profile query. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const school = await db.school.findUnique({ where: { id: actor.schoolId } });
  if (!school) return apiError(404, "not_found", "No such school.");
  return apiOk({ school });
});

const Body = z.object({
  name: z.string().min(1),
  address: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  principalName: z.string().nullish(),
  udiseCode: z.string().nullish(),
  affiliationNo: z.string().nullish(),
  upiId: z.string().nullish(),
  upiPayeeName: z.string().nullish(),
  bankName: z.string().nullish(),
  bankAccountNo: z.string().nullish(),
  bankIfsc: z.string().nullish(),
});

/** Mirrors src/app/app/settings/actions.ts::updateSchool, FormData translated to JSON. */
export const PATCH = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await updateSchoolForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ updated: true });
});
