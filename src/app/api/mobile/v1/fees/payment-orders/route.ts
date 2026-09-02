import { z } from "zod";
import { requireMobileActor } from "@/lib/mobile/session";
import { createPaymentOrderForActor } from "@/lib/mobile/mutations/payments";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  studentId: z.string().min(1),
  invoiceId: z.string().min(1),
});

/** Start a self-serve gateway payment — student or their parent only. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const input = Body.parse(await req.json());

  const result = await createPaymentOrderForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk(result, 201);
});
