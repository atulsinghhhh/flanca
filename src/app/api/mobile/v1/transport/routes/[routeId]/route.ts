import { z } from "zod";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { updateRouteForActor, deleteRouteForActor } from "@/lib/mobile/mutations/transport";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ routeId: string }> };

const Body = z.object({
  name: z.string().min(1),
  vehicleNo: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  driverPhone: z.string().optional().nullable(),
  attendantName: z.string().optional().nullable(),
  capacity: z.number().int().optional().nullable(),
  isActive: z.boolean().optional(),
});

/** Mirrors src/app/app/transport/actions.ts::updateRoute. */
export const PATCH = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { routeId } = await params;
  const input = Body.parse(await req.json());

  const result = await updateRouteForActor(actor, { routeId, ...input });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ messages: result.messages });
});

/** Mirrors src/app/app/transport/actions.ts::deleteRoute — blocked if the route has students or stops. */
export const DELETE = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const { routeId } = await params;

  const result = await deleteRouteForActor(actor, routeId);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ deleted: true });
});
