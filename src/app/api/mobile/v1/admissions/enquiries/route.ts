import { db } from "@/lib/db";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";
import type { EnquiryStatus } from "@prisma/client";

const STATUSES: EnquiryStatus[] = ["NEW", "CONTACTED", "VISITED", "CONVERTED", "LOST"];

/** Mirrors src/app/app/admissions/page.tsx's enquiries query. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const status = new URL(req.url).searchParams.get("status") ?? undefined;

  if (status && !STATUSES.includes(status as EnquiryStatus)) {
    return apiError(422, "invalid_input", `status must be one of: ${STATUSES.join(", ")}`);
  }

  const enquiries = await db.enquiry.findMany({
    where: { schoolId: actor.schoolId, ...(status ? { status: status as EnquiryStatus } : {}) },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return apiOk({ enquiries });
});
