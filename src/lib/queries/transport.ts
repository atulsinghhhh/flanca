import { db } from "@/lib/db";

/**
 * "Which bus is my child on" — the one read-only fact a student or parent
 * needs from the transport module. Route/stop CRUD and boarding stay
 * office-only (see src/app/app/transport/actions.ts); this is the mirror
 * image of that screen's roster table, read from one child's side.
 *
 * A child can only ever have one *current* assignment (toDate: null) at a
 * time — boardStudent's canBoard guard refuses a second active route — so
 * this returns a single row, not a list.
 */
export async function getMyTransport(schoolId: string, studentId: string) {
  const row = await db.studentTransport.findFirst({
    where: { schoolId, studentId, toDate: null },
    select: {
      id: true,
      fromDate: true,
      route: {
        select: {
          id: true,
          name: true,
          vehicleNo: true,
          driverName: true,
          driverPhone: true,
          attendantName: true,
        },
      },
      stop: {
        select: {
          id: true,
          name: true,
          pickupTime: true,
          dropTime: true,
          monthlyFee: true,
        },
      },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    fromDate: row.fromDate,
    route: row.route,
    stop: row.stop,
  };
}
