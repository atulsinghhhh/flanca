import { db } from "@/lib/db";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Detail. Mirrors src/app/app/certificates/[id]/page.tsx's data: the
 * certificate with its student and the school header fields the printed
 * sheet and the public verification page both need.
 */
export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { id } = await params;

  const [certificate, school] = await Promise.all([
    db.certificate.findFirst({
      where: { id, schoolId: actor.schoolId },
      include: { student: { select: { id: true, name: true } } },
    }),
    db.school.findUnique({
      where: { id: actor.schoolId },
      select: { name: true, address: true, phone: true, email: true, affiliationNo: true, udiseCode: true },
    }),
  ]);
  if (!certificate || !school) return apiError(404, "not_found", "That certificate is not in this school.");

  const verifyUrl = `flanca.online/verify/${certificate.verifyToken.slice(0, 8)}`;

  return apiOk({ certificate, school, verifyUrl });
});
