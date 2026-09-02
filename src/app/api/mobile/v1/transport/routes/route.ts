import { z } from "zod";
import { getOfficeTransportRoutes } from "@/lib/queries/transport-routes";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { createRouteForActor } from "@/lib/mobile/mutations/transport";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/**
 * All active routes, their stops, and who is riding — the office CRUD view.
 * Mirrors src/app/app/transport/page.tsx. A student/parent's own bus
 * assignment is GET /api/mobile/v1/transport/me, unrelated to this route.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const routes = await getOfficeTransportRoutes(actor.schoolId);
  return apiOk({ routes });
});

const Body = z.object({
  name: z.string().min(1),
  vehicleNo: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  driverPhone: z.string().optional().nullable(),
  attendantName: z.string().optional().nullable(),
  capacity: z.number().int().optional().nullable(),
});

/** Mirrors src/app/app/transport/actions.ts::createRoute. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await createRouteForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ routeId: result.routeId, messages: result.messages }, 201);
});
