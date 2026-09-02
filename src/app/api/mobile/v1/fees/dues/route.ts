import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { getDuesReport, getFeeTotals } from "@/lib/queries/fees";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

const BUCKETS = ["1-30", "31-60", "61-90", "90+", "CURRENT"] as const;

/** Mirrors the data behind src/app/app/fees/page.tsx (getDuesReport + getFeeTotals). */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || undefined;
  const classId = url.searchParams.get("classId") || undefined;
  const bucketParam = url.searchParams.get("bucket") || undefined;
  const bucket = BUCKETS.find((b) => b === bucketParam);
  const minAmountParam = url.searchParams.get("minAmount");
  const minAmount = minAmountParam ? Number(minAmountParam) : undefined;

  const [totals, dues] = await Promise.all([
    getFeeTotals(actor.schoolId),
    getDuesReport(actor.schoolId, {
      q, classId, bucket,
      minAmount: minAmount != null && Number.isFinite(minAmount) ? minAmount : undefined,
    }),
  ]);

  return apiOk({ totals, dues });
});
