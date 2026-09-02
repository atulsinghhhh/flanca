import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";

export type VerifiedIdentity = {
  id: string;
  name: string;
  email: string;
  schoolId: string | null;
  roles: Role[];
  mustChangePassword: boolean;
};

/**
 * The one place an identifier+password pair is checked against the database.
 * Shared by the web session provider (NextAuth `authorize`) and the mobile
 * token-login route so there is exactly one bcrypt comparison to get right.
 */
export async function verifyCredentials(
  identifier: string,
  password: string,
): Promise<VerifiedIdentity | null> {
  const normalized = identifier.trim().toLowerCase();
  const password_ = password;
  if (!normalized || !password_) return null;

  const digits = normalized.replace(/\D/g, "");
  const user = await db.user.findFirst({
    where: normalized.includes("@")
      ? { email: normalized }
      : { phone: digits.length >= 10 ? digits.slice(-10) : normalized },
    include: { roles: true },
  });

  if (!user?.passwordHash) return null;
  if (!(await bcrypt.compare(password_, user.passwordHash))) return null;

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    schoolId: user.roles[0]?.schoolId ?? null,
    roles: user.roles.map((r) => r.role),
    mustChangePassword: user.mustChangePassword,
  };
}
