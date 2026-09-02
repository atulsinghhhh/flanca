import { z } from "zod";
import { getApaarCentre } from "@/lib/queries/compliance";
import { APAAR_STATES } from "@/lib/core/apaar-core";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

const StateEnum = z.enum(APAAR_STATES);

/** Mirrors src/lib/queries/compliance.ts::getApaarCentre. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const url = new URL(req.url);

  const rawState = url.searchParams.get("state") ?? undefined;
  const parsedState = rawState ? StateEnum.safeParse(rawState) : undefined;
  const state = parsedState?.success ? parsedState.data : undefined;
  const classId = url.searchParams.get("classId") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;

  const centre = await getApaarCentre(actor.schoolId, { state, classId, q });
  return apiOk(centre);
});
