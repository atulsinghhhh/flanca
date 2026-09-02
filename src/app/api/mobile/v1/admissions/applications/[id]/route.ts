import { z } from "zod";
import { db } from "@/lib/db";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { updateApplicationForActor } from "@/lib/mobile/mutations/admissions";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

/** Detail. Mirrors the single-row shape src/app/app/admissions/page.tsx reads for the Applications list. */
export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { id } = await params;

  const application = await db.application.findFirst({
    where: { id, schoolId: actor.schoolId },
  });
  if (!application) return apiError(404, "not_found", "That application is not in this school.");

  return apiOk({ application });
});

const UpdateApplicationBody = z.object({
  status: z.enum([
    "SUBMITTED",
    "UNDER_REVIEW",
    "DOCUMENTS_PENDING",
    "SHORTLISTED",
    "OFFERED",
    "ENROLLED",
    "REJECTED",
    "WITHDRAWN",
  ]),
  documentsNote: z.string().optional(),
  reviewNote: z.string().optional(),
});

/** Mirrors src/app/app/admissions/actions.ts::updateApplication. */
export const PATCH = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { id } = await params;
  const input = UpdateApplicationBody.parse(await req.json());

  const result = await updateApplicationForActor(actor, id, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ updated: true });
});
