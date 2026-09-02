import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { audit } from "@/lib/session";
import { validateNewPassword } from "@/lib/core/login-core";
import { requireMobileActor } from "@/lib/mobile/session";
import { revokeAllRefreshTokens, issueRefreshToken, signAccessToken } from "@/lib/mobile/tokens";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  current: z.string().min(1),
  next: z.string().min(1),
  confirm: z.string().min(1),
});

/** Mirrors src/app/set-password/actions.ts::setOwnPassword for the mobile client. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req, { allowPasswordChange: true });
  const body = Body.parse(await req.json());

  const user = await db.user.findUnique({
    where: { id: actor.id },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) return apiError(422, "no_password", "This account has no password to change.");

  if (!(await bcrypt.compare(body.current, user.passwordHash))) {
    return apiError(401, "wrong_current_password", "That is not the code on your slip. Check it with the school office.");
  }
  if (body.next !== body.confirm) return apiError(422, "mismatch", "The two new passwords do not match.");

  const check = validateNewPassword(body.next, body.current);
  if (!check.ok) return apiError(422, "weak_password", check.reason!);

  await db.user.update({
    where: { id: actor.id },
    data: { passwordHash: await bcrypt.hash(body.next, 10), mustChangePassword: false },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "account.password.set",
    entity: "User",
    entityId: actor.id,
    summary: `${actor.name} set their own password, replacing the code issued by the school`,
  });

  // Every other signed-in device (including the one that had the printed slip) is
  // signed out — the whole point of this screen is that the old code stops working.
  await revokeAllRefreshTokens(actor.id);
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({ uid: actor.id, schoolId: actor.schoolId, roles: actor.roles }),
    issueRefreshToken(actor.id),
  ]);

  return apiOk({ accessToken, refreshToken });
});
