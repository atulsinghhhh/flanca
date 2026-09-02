import { db } from "@/lib/db";
import { getMonthlyRegister } from "@/lib/queries/attendance";
import { requireMobileRole, TEACHING, hasRole, OFFICE } from "@/lib/mobile/session";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/app/app/attendance/register/page.tsx: a class teacher may
 * only view their own section's register — office sees every section. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const url = new URL(req.url);
  const sectionId = url.searchParams.get("sectionId");
  if (!sectionId) return apiError(422, "missing_section", "A section is required.");

  if (!hasRole(actor, ...OFFICE)) {
    const owns = await db.section.findFirst({
      where: { id: sectionId, schoolId: actor.schoolId, classTeacherId: actor.id },
      select: { id: true },
    });
    if (!owns) return apiError(403, "forbidden", "You can only view the register for your own section.");
  }

  const now = new Date();
  const [yearStr, monthStr] = (
    url.searchParams.get("month") ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  ).split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;

  const register = await getMonthlyRegister(actor.schoolId, sectionId, year, month);
  if (!register) return apiError(404, "not_found", "That section is not in this school.");

  return apiOk({
    ...register,
    students: register.students.map((s) => ({ ...s, marks: Object.fromEntries(s.marks) })),
  });
});
