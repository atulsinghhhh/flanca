import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";

export type Actor = {
  id: string;
  name: string;
  email: string;
  schoolId: string;
  roles: Role[];
};

/**
 * Every server action and page goes through here. No school, no data.
 *
 * `allowPasswordChange` exists for exactly one caller: the set-a-password screen
 * itself. A child whose login was issued on a printed slip is held there until
 * they have chosen their own — the office page that prints those slips says so —
 * and without this escape hatch that screen would redirect to itself forever.
 */
export async function requireActor(
  opts: { allowPasswordChange?: boolean } = {},
): Promise<Actor> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!session.user.schoolId) redirect("/login?e=no-school");

  /*
   * A cookie can outlive the row it points at (a reseed, a removed staff member).
   * Verify before trusting it, or the app redirect-loops between /app and /login.
   *
   * Read from the user rather than the membership so the forced-password-change
   * flag comes back in the same query — the check has to be here, on the path
   * every page and every server action already takes, because a gate that only
   * guards pages leaves the actions open.
   */
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      mustChangePassword: true,
      roles: { where: { schoolId: session.user.schoolId }, select: { id: true }, take: 1 },
    },
  });
  if (!user?.roles.length) redirect("/login?e=stale");

  if (user.mustChangePassword && !opts.allowPasswordChange) redirect("/set-password");

  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    schoolId: session.user.schoolId,
    roles: session.user.roles ?? [],
  };
}

export async function requireRole(...allowed: Role[]): Promise<Actor> {
  const actor = await requireActor();
  if (!allowed.some((r) => actor.roles.includes(r))) redirect("/denied");
  return actor;
}

export function hasRole(actor: Actor, ...allowed: Role[]): boolean {
  return allowed.some((r) => actor.roles.includes(r));
}

export const OFFICE: Role[] = ["OWNER", "PRINCIPAL", "ADMIN"];
export const MONEY: Role[] = ["OWNER", "PRINCIPAL", "ADMIN", "ACCOUNTANT"];
export const TEACHING: Role[] = ["OWNER", "PRINCIPAL", "ADMIN", "TEACHER"];

export async function currentSchool(schoolId: string) {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    include: {
      academicYears: { where: { isCurrent: true }, take: 1 },
    },
  });
  if (!school) redirect("/login?e=no-school");
  return { ...school, currentYear: school.academicYears[0] ?? null };
}

/** Every write leaves a trace. This is what makes "undo" and trust possible. */
export async function audit(params: {
  schoolId: string;
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  reversible?: boolean;
}) {
  await db.auditLog.create({
    data: {
      schoolId: params.schoolId,
      actorId: params.actorId ?? null,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId ?? null,
      summary: params.summary,
      before: (params.before ?? undefined) as never,
      after: (params.after ?? undefined) as never,
      reversible: params.reversible ?? false,
    },
  });
}
