import { z } from "zod";
import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { sendFeeRemindersForActor } from "@/lib/mobile/mutations/fees";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  studentIds: z.array(z.string().min(1)).min(1),
  channel: z.enum(["IN_APP", "WHATSAPP", "SMS"]),
});

/** Mirrors src/app/app/fees/actions.ts::sendFeeReminders. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const { studentIds, channel } = Body.parse(await req.json());

  const result = await sendFeeRemindersForActor(actor, studentIds, channel);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ queued: result.queued, skipped: result.skipped });
});
