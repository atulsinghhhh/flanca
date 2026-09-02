import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/session";
import { schoolToday, isoDay } from "@/lib/queries/when";
import { summariseAttendance } from "@/lib/core/attendance-core";
import { requireMobileRole, TEACHING } from "@/lib/mobile/session";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/**
 * A staff member's own attendance — genuinely new, not mirrored from any web
 * page: the office bulk-marks every staff member's attendance
 * (attendance/staff), but nothing in this product previously let a teacher
 * mark their own. Same Attendance row, same clientKey scheme as the office
 * flow (`satt:${staffId}:${date}:0`) — so a teacher self-marking and the
 * office later correcting it collide on the same row rather than each
 * creating their own, and `markedByUserId` records who actually marked it.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...TEACHING);

  const staff = await db.staff.findFirst({ where: { schoolId: actor.schoolId, userId: actor.id }, select: { id: true } });
  if (!staff) return apiError(404, "not_found", "No staff record is linked to this account.");

  const today = schoolToday();
  const since = new Date(today.getTime() - 29 * 86_400_000);

  const rows = await db.attendance.findMany({
    where: { schoolId: actor.schoolId, staffId: staff.id, period: 0, date: { gte: since } },
    orderBy: { date: "desc" },
    select: { date: true, status: true },
  });

  const todayRow = rows.find((r) => isoDay(r.date) === isoDay(today));

  return apiOk({
    today: { date: isoDay(today), status: todayRow?.status ?? null },
    summary: summariseAttendance(rows as never),
    recent: rows.map((r) => ({ date: isoDay(r.date), status: r.status })),
  });
});

const Body = z.object({ status: z.enum(["PRESENT", "ABSENT", "LATE", "LEAVE"]) });

/** Marks the signed-in staff member's own attendance for today — today only,
 * so a phone accidentally left in a bag yesterday can't retroactively
 * self-certify a day nobody else can see. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const { status } = Body.parse(await req.json());

  const staff = await db.staff.findFirst({ where: { schoolId: actor.schoolId, userId: actor.id }, select: { id: true } });
  if (!staff) return apiError(404, "not_found", "No staff record is linked to this account.");

  const today = schoolToday();
  const date = isoDay(today);
  const clientKey = `satt:${staff.id}:${date}:0`;

  await db.attendance.upsert({
    where: { schoolId_clientKey: { schoolId: actor.schoolId, clientKey } },
    create: {
      schoolId: actor.schoolId,
      date: today,
      staffId: staff.id,
      period: 0,
      status,
      markedByUserId: actor.id,
      clientKey,
      syncedAt: new Date(),
    },
    update: { status, markedByUserId: actor.id, markedAt: new Date(), syncedAt: new Date() },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "attendance.staff.self_mark",
    entity: "Staff",
    entityId: staff.id,
    summary: `Marked own attendance for ${date}: ${status}`,
  });

  return apiOk({ ok: true, status });
});
