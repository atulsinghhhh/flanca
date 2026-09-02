import { db } from "@/lib/db";
import { requireMobileActor, hasRole } from "@/lib/mobile/session";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";
import { schoolToday } from "@/lib/queries/when";

/** A bare YYYY-MM-DD query value, taken as midnight UTC — same convention as schoolToday(). */
function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * src/app/app/calendar/page.tsx is open to any logged-in actor (`requireActor()`, no role
 * check) and, on that page, applies no `isPublic` filter at all — every role sees every
 * event in the month grid and the "coming up" list. That is broader than this mobile feed
 * should be: src/lib/queries/role-home.ts::getParentHome is the narrower, role-aware
 * precedent for a parent/student-facing feed, and it filters events to `isPublic: true`.
 * We follow that precedent here: staff (office/teaching/accounts/library roles) see every
 * event, matching what they'd see on the web calendar; parents and students see only
 * `isPublic: true` events.
 */
const STAFF_ROLES = ["OWNER", "PRINCIPAL", "ADMIN", "ACCOUNTANT", "TEACHER", "LIBRARIAN"] as const;

export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const url = new URL(req.url);

  const from = parseDateParam(url.searchParams.get("from")) ?? schoolToday();
  const to = parseDateParam(url.searchParams.get("to"));
  const isStaff = hasRole(actor, ...STAFF_ROLES);

  const events = await db.calendarEvent.findMany({
    where: {
      schoolId: actor.schoolId,
      startDate: { gte: from, ...(to ? { lte: to } : {}) },
      ...(isStaff ? {} : { isPublic: true }),
    },
    orderBy: { startDate: "asc" },
    // No explicit ?to= means an open-ended "from today onward" range; cap it so a school
    // with years of holidays/events on the books can't return an unbounded feed.
    take: 60,
  });

  return apiOk({ events });
});
