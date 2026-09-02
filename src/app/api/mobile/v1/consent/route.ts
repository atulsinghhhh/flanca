import { z } from "zod";
import { getConsentRegister } from "@/lib/queries/compliance";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { recordConsentForActor } from "@/lib/mobile/mutations/consent";
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

/** Mirrors src/lib/queries/compliance.ts::getConsentRegister. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const url = new URL(req.url);

  const purpose = url.searchParams.get("purpose") ?? undefined;
  const state = url.searchParams.get("state") ?? undefined;
  const classId = url.searchParams.get("classId") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;

  const register = await getConsentRegister(actor.schoolId, { purpose, state, classId, q });
  return apiOk(register);
});

const Body = z.object({
  studentId: z.string().min(1),
  purpose: ConsentPurposeEnum,
  state: ConsentStateEnum,
  verifiedVia: z.string().min(1).optional(),
  grantedByName: z.string().min(1).optional(),
  verifiedRef: z.string().min(1).optional(),
});

/** Mirrors src/app/app/consent/actions.ts::recordConsent. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await recordConsentForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ receiptNo: result.receiptNo });
});
