import { buildFeeStructureTemplate, buildStaffTemplate, buildStudentTemplate } from "@/lib/import/parse";
import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { apiError, withMobileRoute } from "@/lib/mobile/response";

const TEMPLATES = {
  STUDENTS: { build: buildStudentTemplate, fileName: "flanca-student-import-template.xlsx" },
  STAFF: { build: buildStaffTemplate, fileName: "flanca-staff-import-template.xlsx" },
  FEE_STRUCTURE: { build: buildFeeStructureTemplate, fileName: "flanca-fee-structure-import-template.xlsx" },
} as const;

/** The blank sheet for a school whose records are still on paper. Mirrors src/app/app/import/template/route.ts. */
export const GET = withMobileRoute(async (req: Request) => {
  await requireMobileRole(req, ...MONEY);

  const kind = new URL(req.url).searchParams.get("kind") ?? "STUDENTS";
  const template = TEMPLATES[kind as keyof typeof TEMPLATES];
  if (!template) return apiError(422, "invalid_input", "Unknown import kind.");

  const file = template.build();
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${template.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
});
