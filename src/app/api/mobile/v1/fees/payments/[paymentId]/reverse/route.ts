import { z } from "zod";
import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { reversePaymentForActor } from "@/lib/mobile/mutations/fees";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ paymentId: string }> };

const Body = z.object({ reason: z.string().min(1) });

/** Mirrors src/app/app/fees/actions.ts::reversePayment. Never deleted — a receipt was printed. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const { paymentId } = await params;
  const { reason } = Body.parse(await req.json());

  const result = await reversePaymentForActor(actor, paymentId, reason);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ reversed: true });
});
