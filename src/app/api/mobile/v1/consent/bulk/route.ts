import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { bulkConsentForActor } from "@/lib/mobile/mutations/consent";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const ConsentPurposeEnum = z.enum([
  "ENROLMENT_DATA",
  "APAAR_GENERATION",
  "PHOTO_MEDIA",
  "COMMUNICATION",
  "HEALTH_RECORDS",
  "THIRD_PARTY_SHARING",
]);
const ConsentStateEnum = z.enum(["PENDING", "GRANTED", "REFUSED", "WITHDRAWN"]);

const Body = z.object({
  studentIds: z.array(z.string().min(1)).min(1),
  purpose: ConsentPurposeEnum,
  state: ConsentStateEnum,
  verifiedVia: z.string().min(1).optional(),
});

/** Mirrors src/app/app/consent/actions.ts::bulkConsent. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await bulkConsentForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ count: result.count });
});
