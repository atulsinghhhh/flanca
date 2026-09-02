import { requireMobileActor } from "@/lib/mobile/session";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req, { allowPasswordChange: true });
  return apiOk({ actor });
});
