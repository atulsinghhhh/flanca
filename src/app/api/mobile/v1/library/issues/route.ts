import { z } from "zod";
import { getOpenIssues } from "@/lib/queries/library";
import { requireMobileRole } from "@/lib/mobile/session";
import { LIBRARY_ROLES, issueBookForActor } from "@/lib/mobile/mutations/library";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Current issues, soonest due first. Mirrors src/app/app/library/page.tsx's "Books out" table. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...LIBRARY_ROLES);
  const issues = await getOpenIssues(actor.schoolId);
  return apiOk({ issues });
});

// Accepts the original student-only shape (the shipped mobile app) as well as
// the newer { borrowerType, borrowerId } shape that also covers staff.
const Body = z.union([
  z.object({ bookId: z.string().min(1), studentId: z.string().min(1) }),
  z.object({ bookId: z.string().min(1), borrowerType: z.enum(["student", "staff"]), borrowerId: z.string().min(1) }),
]);

/** Mirrors src/app/app/library/actions.ts::issueBook — a librarian handing a book across the desk. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...LIBRARY_ROLES);
  const raw = Body.parse(await req.json());
  const input = "studentId" in raw
    ? { bookId: raw.bookId, borrowerType: "student" as const, borrowerId: raw.studentId }
    : raw;

  const result = await issueBookForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ ok: true }, 201);
});
