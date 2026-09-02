import { z } from "zod";
import { requireMobileActor } from "@/lib/mobile/session";
import { submitHomeworkForActor } from "@/lib/mobile/mutations/homework";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

const Body = z.object({
  note: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
});

/**
 * Mirrors src/app/app/homework/actions.ts::submitHomework. Student-only, but
 * that is enforced by looking up the caller's own Student row (same as the web
 * action) rather than a role gate — any signed-in actor may call this, and the
 * mutation itself refuses when the caller has no Student row.
 */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileActor(req);
  const { id } = await params;
  const input = Body.parse(await req.json());

  const result = await submitHomeworkForActor(actor, id, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ ok: true }, 201);
});
