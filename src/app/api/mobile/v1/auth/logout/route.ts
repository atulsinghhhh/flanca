import { z } from "zod";
import { revokeRefreshToken } from "@/lib/mobile/tokens";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({ refreshToken: z.string().min(1) });

export const POST = withMobileRoute(async (req: Request) => {
  const body = Body.parse(await req.json());
  await revokeRefreshToken(body.refreshToken);
  return apiOk({ ok: true });
});
