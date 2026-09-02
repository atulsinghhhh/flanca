import { z } from "zod";
import { requireMobileActor } from "@/lib/mobile/session";
import { confirmPaymentForActor } from "@/lib/mobile/mutations/payments";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

const Body = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

/** The step that stands in for a webhook: verify Razorpay's signature, then settle. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileActor(req);
  const { id } = await params;
  const body = Body.parse(await req.json());

  const result = await confirmPaymentForActor(actor, { paymentOrderId: id, ...body });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk(result);
});
