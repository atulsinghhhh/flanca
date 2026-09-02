import { z } from "zod";
import { getHostelRooms } from "@/lib/queries/hostel";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { saveRoomForActor } from "@/lib/mobile/mutations/hostel";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Rooms with current occupancy. Mirrors src/app/app/hostel/page.tsx's room list. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const rooms = await getHostelRooms(actor.schoolId);
  return apiOk({ rooms });
});

const Body = z.object({
  roomId: z.string().min(1).optional().nullable(),
  roomNo: z.string().min(1),
  block: z.string().optional().nullable(),
  capacity: z.number().int(),
  kind: z.string().optional().nullable(),
  wardenName: z.string().optional().nullable(),
});

/** Mirrors src/app/app/hostel/actions.ts::saveRoom — creates or updates depending on roomId. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await saveRoomForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ roomId: result.roomId, messages: result.messages }, input.roomId ? 200 : 201);
});
