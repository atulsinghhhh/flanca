import { z } from "zod";
import { db } from "@/lib/db";
import { requireMobileActor, requireMobileRole, hasRole, OFFICE } from "@/lib/mobile/session";
import { publishCircularForActor } from "@/lib/mobile/mutations/notices";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";
import type { Actor } from "@/lib/session";

/**
 * `Circular.audience` is a free-text field (see prisma/schema.prisma): one of
 * ALL | PARENTS | TEACHERS | STUDENTS | STAFF | CLASS:<id>. src/app/app/notices/page.tsx
 * (office-only) shows every circular for the school with no audience filter at all —
 * the office is allowed to see what it published to anyone. src/lib/queries/role-home.ts
 * narrows for non-office callers: getParentHome uses `audience: {in: ["ALL","PARENTS"]}`,
 * getStudentHome uses `audience: {in: ["ALL","STUDENTS"]}`. This mirrors both precedents,
 * generalised across all roles instead of hardcoding the parent/student cases.
 *
 * Returns `null` to mean "no audience filter" (office sees everything, same as the web page).
 * `CLASS:<id>` targeting is not resolved here, matching role-home's existing behaviour —
 * neither getParentHome nor getStudentHome match against a student's actual class either.
 */
function audienceFilter(actor: Actor): string[] | null {
  if (hasRole(actor, ...OFFICE)) return null;

  const audiences = new Set<string>(["ALL"]);
  if (hasRole(actor, "TEACHER")) {
    audiences.add("TEACHERS");
    audiences.add("STAFF");
  }
  if (hasRole(actor, "ACCOUNTANT", "LIBRARIAN")) {
    audiences.add("STAFF");
  }
  if (hasRole(actor, "PARENT")) audiences.add("PARENTS");
  if (hasRole(actor, "STUDENT")) audiences.add("STUDENTS");

  return [...audiences];
}

export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const audiences = audienceFilter(actor);

  const circulars = await db.circular.findMany({
    where: {
      schoolId: actor.schoolId,
      publishedAt: { not: null },
      ...(audiences ? { audience: { in: audiences } } : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 30,
  });

  return apiOk({ circulars });
});

const Body = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  audience: z.enum(["ALL", "PARENTS", "TEACHERS", "STUDENTS", "STAFF"]),
  isPublic: z.boolean().optional(),
});

/** Mirrors src/app/app/notices/actions.ts::publishCircular, IN_APP only. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await publishCircularForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ circularId: result.circularId, inApp: result.inApp }, 201);
});
