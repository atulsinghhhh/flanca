"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { audit, requireActor } from "@/lib/session";
import { validateNewPassword } from "@/lib/core/login-core";

/**
 * A child (or anyone else on an issued code) picking their own password.
 *
 * `allowPasswordChange` is passed because `requireActor` would otherwise send
 * this action's own caller back to this screen — the flag it is here to clear is
 * the thing being checked.
 *
 * The old code is required as well as the new one. Without it, an unattended
 * laptop in a computer room is a way to lock a classmate out of their account:
 * the session is already signed in, and the whole point of this screen is that it
 * is reached before anything else.
 */
export async function setOwnPassword(input: {
  current: string;
  next: string;
  confirm: string;
}): Promise<{ error: string } | { ok: true }> {
  const actor = await requireActor({ allowPasswordChange: true });

  const user = await db.user.findUnique({
    where: { id: actor.id },
    select: { passwordHash: true, mustChangePassword: true },
  });
  if (!user?.passwordHash) return { error: "This account has no password to change." };

  if (!(await bcrypt.compare(input.current, user.passwordHash))) {
    return { error: "That is not the code on your slip. Check it with the school office." };
  }

  if (input.next !== input.confirm) return { error: "The two new passwords do not match." };

  const check = validateNewPassword(input.next, input.current);
  if (!check.ok) return { error: check.reason! };

  await db.user.update({
    where: { id: actor.id },
    data: { passwordHash: await bcrypt.hash(input.next, 10), mustChangePassword: false },
  });

  /*
   * Audited that it happened, never what it is. "This account stopped using the
   * code the school issued" is the useful fact, and it is also the answer when a
   * parent asks whether anybody else could still get in with the slip.
   */
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "account.password.set",
    entity: "User",
    entityId: actor.id,
    summary: `${actor.name} set their own password, replacing the code issued by the school`,
  });

  return { ok: true };
}
