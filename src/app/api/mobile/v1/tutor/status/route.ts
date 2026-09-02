import { tutorOn, tutorSeats } from "@/lib/queries/tutor";
import { requireMobileActor } from "@/lib/mobile/session";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/**
 * Whether the tutor entry point should even be shown, before the client
 * attempts /tutor/enter. Mirrors the feature-flag/seat checks the web app's
 * tutor pages run before rendering an entry link — `tutorOn()` is the plain
 * "did the school buy this" flag, `tutorSeats()` is the live seat count
 * (itself a `TutorResult<Seats>`: `state` is "off" when not configured,
 * "unreachable"/"refused" on a failed call, "ok" with `data` on success).
 */
export const GET = withMobileRoute(async (req: Request) => {
  await requireMobileActor(req);

  const [on, seats] = await Promise.all([tutorOn(), tutorSeats()]);
  return apiOk({ on, seats });
});
