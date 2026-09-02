import { db } from "@/lib/db";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";
import type { ApplicationStatus } from "@prisma/client";

const STATUSES: ApplicationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "DOCUMENTS_PENDING",
  "SHORTLISTED",
  "OFFERED",
  "ENROLLED",
  "REJECTED",
  "WITHDRAWN",
];

/** Mirrors src/app/app/admissions/page.tsx's applications query. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const status = new URL(req.url).searchParams.get("status") ?? undefined;

  if (status && !STATUSES.includes(status as ApplicationStatus)) {
    return apiError(422, "invalid_input", `status must be one of: ${STATUSES.join(", ")}`);
  }

  const applications = await db.application.findMany({
    where: { schoolId: actor.schoolId, ...(status ? { status: status as ApplicationStatus } : {}) },
    orderBy: { submittedAt: "desc" },
    take: 60,
  });

  return apiOk({ applications });
});
