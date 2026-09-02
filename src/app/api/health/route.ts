import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fatalities, preflight } from "@/lib/preflight";
import { tutorConfig } from "@/lib/tutor/client";

export const dynamic = "force-dynamic";

/**
 * What a host's health check should ask, and what a human should ask at 8am.
 *
 * Every hosting platform wants a path that answers 200 when the app can serve
 * and something else when it cannot. "The process is up" is not that: a Next
 * server whose database is unreachable answers 200 on every static route while
 * every screen a school opens is a 500.
 *
 * So this touches the database, and it reports three things a person actually
 * needs on the morning of a demo:
 *
 *   - **migrated**: whether the schema is the one the code expects. A deploy that
 *     skipped `prisma migrate deploy` fails in the middle of a fee collection,
 *     not at boot.
 *   - **configured**: whether preflight is clean. A fatal finding cannot happen
 *     here in production — the server refuses to start — but a warning can, and
 *     "parents get no notifications" is worth being able to see.
 *   - **tutor**: on, off, or half-configured. Never the key.
 *
 * It says nothing about students, staff, money or names. A health endpoint is
 * unauthenticated by necessity, so it must be dull to read.
 */
export async function GET() {
  const started = Date.now();

  let database = false;
  let migrations: number | null = null;
  let hasSchool = false;
  let currentYear = false;

  try {
    await db.$queryRaw`SELECT 1`;
    database = true;

    const [applied] = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
    `;
    migrations = Number(applied?.n ?? 0);

    const school = await db.school.findFirst({
      select: { id: true, academicYears: { where: { isCurrent: true }, select: { id: true }, take: 1 } },
    });
    hasSchool = Boolean(school);
    currentYear = Boolean(school?.academicYears.length);
  } catch {
    // Reported as false rather than thrown: a health check that 500s tells a
    // load balancer less than one that answers with the reason.
  }

  const findings = preflight({
    nodeEnv: process.env.NODE_ENV,
    vars: process.env as Record<string, string | undefined>,
  });

  const tutor = tutorConfig();
  const tutorVars = ["TUTOR_API_URL", "TUTOR_ORG_REF", "TUTOR_ORG_KEY"].filter(
    (k) => (process.env[k] ?? "") !== "",
  ).length;

  const ok = database && migrations !== null && migrations > 0;

  return NextResponse.json(
    {
      ok,
      database,
      migrations,
      // A school with no current academic year cannot raise an invoice or
      // publish a report card, which is a real "not ready" that boots fine.
      school: hasSchool,
      currentYear,
      configured: {
        fatal: fatalities(findings).length,
        warnings: findings.length - fatalities(findings).length,
        keys: findings.map((f) => f.key),
      },
      tutor: tutor ? "on" : tutorVars > 0 ? "half-configured" : "off",
      ms: Date.now() - started,
    },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
