import { z } from "zod";
import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { collectPaymentForActor } from "@/lib/mobile/mutations/fees";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const AllocationSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number(),
  lateFee: z.number().optional(),
});

const Body = z.object({
  studentId: z.string().min(1),
  allocations: z.array(AllocationSchema).min(1),
  mode: z.enum(["CASH", "CHEQUE", "UPI", "CARD", "NETBANKING", "DD", "NEFT", "ADJUSTMENT"]),
  reference: z.string().optional(),
  bankName: z.string().optional(),
  note: z.string().optional(),
  paidAt: z.string().optional(),
});

/** Mirrors src/app/app/fees/actions.ts::collectPayment. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const input = Body.parse(await req.json());

  const result = await collectPaymentForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ receiptIds: result.receiptIds, collected: result.collected });
});
