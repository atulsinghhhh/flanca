import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { uploadFeeStructureFileForActor } from "@/lib/mobile/mutations/import";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Step 1 — upload and validate a fee-structure sheet. Mirrors uploadFeeStructureFile. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return apiError(422, "invalid_input", "Choose a file first.");

  const result = await uploadFeeStructureFileForActor(actor, file);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk(result, 201);
});
