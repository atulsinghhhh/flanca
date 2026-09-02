import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { audit } from "@/lib/session";
import { requireMobileActor } from "@/lib/mobile/session";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  current: z.string().min(1),
  next: z.string().min(1),
});

/**
 * Mirrors src/app/app/staff/people-actions.ts::changeMyPassword — anybody
 * signed in changing their own password, at any time (not the must-change
 * flow gated behind mustChangePassword, which is auth/set-password/route.ts).
 * Not role-gated: every actor with a role at this school may call this.
 */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const body = Body.parse(await req.json());

  const me = await db.user.findUnique({
    where: { id: actor.id },
    select: { id: true, passwordHash: true, name: true },
  });
  if (!me?.passwordHash) return apiError(422, "no_password", "This account does not sign in with a password.");

  if (!(await bcrypt.compare(body.current, me.passwordHash))) {
    return apiError(401, "wrong_current_password", "That is not your current password.");
  }
  if (body.next.length < 8) return apiError(422, "weak_password", "A password needs at least 8 characters.");
  if (body.next === body.current) {
    return apiError(422, "same_password", "That is the password you already have.");
  }

  await db.user.update({
    where: { id: me.id },
    data: { passwordHash: await bcrypt.hash(body.next, 10) },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "staff.password.change",
    entity: "User",
    entityId: me.id,
    summary: `${me.name} changed their own password.`,
  });

  return apiOk({ ok: true });
});
