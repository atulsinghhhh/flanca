import { z } from "zod";
import { requireMobileActor } from "@/lib/mobile/session";
import { startThreadForActor } from "@/lib/mobile/mutations/chat";
import { getInbox } from "@/lib/queries/chat";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/lib/queries/chat.ts::getInbox — the conversation list. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const closed = new URL(req.url).searchParams.get("closed") === "true";

  const threads = await getInbox(actor.schoolId, actor.id, { closed });
  return apiOk({ threads });
});

const Body = z.object({
  targetUserId: z.string().min(1),
  studentId: z.string().min(1).optional().nullable(),
  body: z.string(),
  subject: z.string().optional().nullable(),
  originCircularId: z.string().optional().nullable(),
});

/** Mirrors src/app/app/chat/actions.ts::startThread. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const input = Body.parse(await req.json());

  const result = await startThreadForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ threadId: result.threadId, reused: result.reused });
});
