import { z } from "zod";
import { resolveDay } from "@/lib/queries/when";
import { getSectionSheet } from "@/lib/queries/attendance";
import { requireMobileRole, TEACHING } from "@/lib/mobile/session";
import { saveAttendanceForActor } from "@/lib/mobile/mutations/attendance";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ sectionId: string }> };

export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const { sectionId } = await params;
  const date = new URL(req.url).searchParams.get("date") ?? undefined;

  const sheet = await getSectionSheet(actor.schoolId, sectionId, resolveDay(date));
  if (!sheet) return apiError(404, "not_found", "That section is not in this school.");
  return apiOk(sheet);
});

const MarkSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "LEAVE"]),
});

const Body = z.object({
  date: z.string().min(1),
  marks: z.array(MarkSchema).min(1),
  period: z.number().int().min(0).optional(),
});

/** Mirrors src/app/app/attendance/actions.ts::saveAttendance. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const { sectionId } = await params;
  const input = Body.parse(await req.json());

  const result = await saveAttendanceForActor(actor, sectionId, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ saved: result.saved, absent: result.absent, rejected: result.rejected });
});
