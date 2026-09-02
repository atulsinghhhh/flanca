import { buildFeeStructureTemplate, buildStaffTemplate, buildStudentTemplate } from "@/lib/import/parse";
import { requireActor } from "@/lib/session";

const TEMPLATES = {
  STUDENTS: { build: buildStudentTemplate, fileName: "flanca-student-import-template.xlsx" },
  STAFF: { build: buildStaffTemplate, fileName: "flanca-staff-import-template.xlsx" },
  FEE_STRUCTURE: { build: buildFeeStructureTemplate, fileName: "flanca-fee-structure-import-template.xlsx" },
} as const;

/** The blank sheet for a school whose records are still on paper. */
export async function GET(request: Request) {
  await requireActor();
  const kind = new URL(request.url).searchParams.get("kind") ?? "STUDENTS";
  const template = TEMPLATES[kind as keyof typeof TEMPLATES] ?? TEMPLATES.STUDENTS;
  const file = template.build();

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${template.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
