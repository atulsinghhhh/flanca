import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/session";
import { resolveDay } from "@/lib/queries/when";
import { getStaffAttendance } from "@/lib/queries/attendance";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const date = new URL(req.url).searchParams.get("date") ?? undefined;
  return apiOk(await getStaffAttendance(actor.schoolId, resolveDay(date)));
});

const Body = z.object({
  date: z.string().min(1),
  marks: z.array(z.object({
    staffId: z.string().min(1),
    status: z.enum(["PRESENT", "ABSENT", "LATE", "LEAVE"]),
  })).min(1),
});

/** Mirrors src/app/app/attendance/actions.ts::saveStaffAttendance. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const parsed = new Date(`${input.date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return apiError(422, "invalid_date", "That date is not valid.");
  const day = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));

  const staff = await db.staff.findMany({
    where: { schoolId: actor.schoolId, isActive: true },
    select: { id: true },
  });
  const valid = new Set(staff.map((s) => s.id));
  const accepted = input.marks.filter((m) => valid.has(m.staffId));
  if (accepted.length === 0) return apiError(422, "no_valid_staff", "No valid staff in that list.");

  await db.$transaction(
    async (tx) => {
      for (const m of accepted) {
        const clientKey = `satt:${m.staffId}:${input.date}:0`;
        await tx.attendance.upsert({
          where: { schoolId_clientKey: { schoolId: actor.schoolId, clientKey } },
          create: {
            schoolId: actor.schoolId,
            date: day,
            staffId: m.staffId,
            period: 0,
            status: m.status,
            markedByUserId: actor.id,
            clientKey,
            syncedAt: new Date(),
          },
          update: {
            status: m.status,
            markedByUserId: actor.id,
            markedAt: new Date(),
            syncedAt: new Date(),
          },
        });
      }
    },
    { timeout: 60_000 },
  );

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "attendance.staff.mark",
    entity: "School",
    entityId: actor.schoolId,
    summary: `Marked staff attendance for ${input.date}: ${accepted.length} staff`,
  });

  return apiOk({ saved: accepted.length });
});
