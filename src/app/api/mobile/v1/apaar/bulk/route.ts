import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { bulkRecordApaarIdsForActor } from "@/lib/mobile/mutations/apaar";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({
  records: z
    .array(
      z.object({
        admissionNumber: z.string().min(1),
        apaarId: z.string().min(1),
      }),
    )
    .min(1),
});

/**
 * Mirrors src/app/app/apaar/actions.ts::bulkRecordApaarIds, adapted for a
 * mobile client: a phone can't paste a spreadsheet block, so this takes the
 * already-split admission#/APAAR-ID pairs directly instead of raw pasted text.
 */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await bulkRecordApaarIdsForActor(actor, input.records);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ applied: result.applied, problems: result.problems });
});
