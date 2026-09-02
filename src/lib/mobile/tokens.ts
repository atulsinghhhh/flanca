import { randomBytes, createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";

const ACCESS_TOKEN_TTL_SECONDS = 30 * 60; // 30 minutes
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function secretKey() {
  const secret = process.env.MOBILE_JWT_SECRET;
  if (!secret) throw new Error("MOBILE_JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export type AccessTokenPayload = {
  uid: string;
  schoolId: string;
  roles: Role[];
};

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ schoolId: payload.schoolId, roles: payload.roles })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.uid)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return {
      uid: payload.sub,
      schoolId: payload.schoolId as string,
      roles: (payload.roles as Role[]) ?? [],
    };
  } catch {
    return null;
  }
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function newRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function issueRefreshToken(
  userId: string,
  deviceInfo?: string | null,
): Promise<string> {
  const raw = newRawToken();
  await db.mobileRefreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      deviceInfo: deviceInfo ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return raw;
}

/** Verifies a refresh token, revokes it, and issues a replacement — rotation-on-use. */
export async function rotateRefreshToken(
  raw: string,
): Promise<{ userId: string; refreshToken: string } | null> {
  const row = await db.mobileRefreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!row || row.revokedAt || row.expiresAt < new Date()) return null;

  await db.mobileRefreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  const refreshToken = await issueRefreshToken(row.userId, row.deviceInfo);
  return { userId: row.userId, refreshToken };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await db.mobileRefreshToken.updateMany({
    where: { tokenHash: hashToken(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revokes every refresh token for a user — called on password change. */
export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await db.mobileRefreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
