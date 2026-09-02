import { z } from "zod";
import { verifyCredentials } from "@/lib/auth-credentials";
import { signAccessToken, issueRefreshToken } from "@/lib/mobile/tokens";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  deviceInfo: z.string().optional(),
});

export const POST = withMobileRoute(async (req: Request) => {
  const body = Body.parse(await req.json());

  const identity = await verifyCredentials(body.identifier, body.password);
  if (!identity) return apiError(401, "invalid_credentials", "That email/phone and password don't match.");
  if (!identity.schoolId) return apiError(401, "no_school", "This account is not attached to a school.");

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({ uid: identity.id, schoolId: identity.schoolId, roles: identity.roles }),
    issueRefreshToken(identity.id, body.deviceInfo),
  ]);

  return apiOk({
    accessToken,
    refreshToken,
    actor: {
      id: identity.id,
      name: identity.name,
      email: identity.email,
      schoolId: identity.schoolId,
      roles: identity.roles,
      mustChangePassword: identity.mustChangePassword,
    },
  });
});
