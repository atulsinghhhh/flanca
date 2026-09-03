import { db } from "@/lib/db";
import { requireMobileActor, hasRole } from "@/lib/mobile/session";
import { getOverview } from "@/lib/queries/dashboard";
import { getTeacherHome, getParentHome, getStudentHome } from "@/lib/queries/role-home";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/app/app/page.tsx's role branching, one entry point / four homes. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);

  if (!hasRole(actor, "OWNER", "PRINCIPAL", "ADMIN", "ACCOUNTANT")) {
    if (hasRole(actor, "PARENT")) {
      return apiOk({ role: "PARENT", home: await getParentHome(actor.schoolId, actor.id) });
    }
    if (hasRole(actor, "STUDENT")) {
      return apiOk({ role: "STUDENT", home: await getStudentHome(actor.schoolId, actor.id) });
    }
    if (hasRole(actor, "TEACHER")) {
      return apiOk({ role: "TEACHER", home: await getTeacherHome(actor.schoolId, actor.id) });
    }
  }

  const school = await db.school.findUnique({
    where: { id: actor.schoolId },
    select: { id: true, name: true, slug: true },
  });
  const overview = await getOverview(actor.schoolId);
  // ADMIN (office/clerk) gets everything except money — that's PRINCIPAL/
  // OWNER/ACCOUNTANT territory. Strip it here rather than trust the client
  // to hide a card, since the client already has the numbers once sent.
  const canSeeFinance = hasRole(actor, "OWNER", "PRINCIPAL", "ACCOUNTANT");
  const { money: _money, ...overviewWithoutMoney } = overview;
  const home = canSeeFinance ? overview : overviewWithoutMoney;
  return apiOk({ role: "OFFICE", school, home });
});
