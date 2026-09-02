import { db } from "@/lib/db";
import { verifyAccessToken } from "@/lib/mobile/tokens";
import { hasRole, type Actor } from "@/lib/session";
import type { Role } from "@prisma/client";

export { hasRole, OFFICE, MONEY, TEACHING } from "@/lib/session";

export class MobileAuthError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

/**
 * The mobile-API twin of `requireActor` (src/lib/session.ts): same staleness
 * checks (role membership still exists, must-change-password gate), but it
 * throws a typed, catchable error instead of redirecting — there is no page
 * to redirect a JSON client to.
 */
export async function requireMobileActor(
  req: Request,
  opts: { allowPasswordChange?: boolean } = {},
): Promise<Actor> {
  const token = bearerToken(req);
  if (!token) throw new MobileAuthError(401, "missing_token", "No access token provided.");

  const payload = await verifyAccessToken(token);
  if (!payload) throw new MobileAuthError(401, "invalid_token", "Access token is invalid or expired.");

  const user = await db.user.findUnique({
    where: { id: payload.uid },
    select: {
      name: true,
      email: true,
      mustChangePassword: true,
      roles: { where: { schoolId: payload.schoolId }, select: { role: true } },
    },
  });
  if (!user?.roles.length) throw new MobileAuthError(401, "stale_session", "This account no longer has access.");

  if (user.mustChangePassword && !opts.allowPasswordChange) {
    throw new MobileAuthError(403, "must_change_password", "Password must be changed before continuing.");
  }

  return {
    id: payload.uid,
    name: user.name,
    email: user.email,
    schoolId: payload.schoolId,
    roles: user.roles.map((r) => r.role),
  };
}

export async function requireMobileRole(req: Request, ...allowed: Role[]): Promise<Actor> {
  const actor = await requireMobileActor(req);
  if (!hasRole(actor, ...allowed)) {
    throw new MobileAuthError(403, "forbidden", "You do not have access to this.");
  }
  return actor;
}
