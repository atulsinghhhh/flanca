import { z } from "zod";
import { db } from "@/lib/db";
import { signAccessToken, rotateRefreshToken } from "@/lib/mobile/tokens";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({ refreshToken: z.string().min(1) });

export const POST = withMobileRoute(async (req: Request) => {
  const body = Body.parse(await req.json());

  const rotated = await rotateRefreshToken(body.refreshToken);
  if (!rotated) return apiError(401, "invalid_refresh_token", "Sign in again.");

  const user = await db.user.findUnique({
    where: { id: rotated.userId },
    select: { roles: { select: { schoolId: true, role: true } } },
  });
  const schoolId = user?.roles[0]?.schoolId;
  if (!schoolId) return apiError(401, "no_school", "This account is not attached to a school.");

  const roles = user!.roles.filter((r) => r.schoolId === schoolId).map((r) => r.role);
  const accessToken = await signAccessToken({ uid: rotated.userId, schoolId, roles });

  return apiOk({ accessToken, refreshToken: rotated.refreshToken });
});
