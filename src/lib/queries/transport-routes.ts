import { db } from "@/lib/db";
import { canDeleteRoute, canDeleteStop } from "@/lib/core/operations-core";

export type TransportRouteRow = {
  id: string;
  name: string;
  vehicleNo: string | null;
  driverName: string | null;
  driverPhone: string | null;
  attendantName: string | null;
  capacity: number | null;
  isActive: boolean;
  onBoard: number;
  removable: boolean;
  whyNot: string | null;
  stops: {
    id: string;
    name: string;
    monthlyFee: number;
    pickupTime: string | null;
    dropTime: string | null;
    students: number;
    removable: boolean;
    whyNot: string | null;
  }[];
  students: {
    studentTransportId: string;
    fromDate: Date;
    student: { id: string; name: string; class: string | null; section: string | null };
    stop: { id: string; name: string; monthlyFee: number } | null;
  }[];
};

/**
 * All active routes, their stops, and who is riding — the mobile twin of
 * src/app/app/transport/page.tsx's office view (same query shape, same
 * ever-used `removable` guards from core rather than re-typed here). This is
 * the office CRUD surface; a student/parent's own assignment is
 * getMyTransport in src/lib/queries/transport.ts, which this file does not
 * touch.
 */
export async function getOfficeTransportRoutes(schoolId: string): Promise<TransportRouteRow[]> {
  const routes = await db.transportRoute.findMany({
    where: { schoolId, isActive: true },
    orderBy: { name: "asc" },
    include: {
      stops: { orderBy: { sequenceOrder: "asc" }, include: { _count: { select: { students: true } } } },
      students: {
        where: { toDate: null },
        include: {
          student: {
            select: { id: true, name: true, class: { select: { name: true } }, section: { select: { name: true } } },
          },
          stop: { select: { id: true, name: true, monthlyFee: true } },
        },
      },
    },
  });

  return routes.map((r) => {
    const guard = canDeleteRoute({ students: r.students.length, stops: r.stops.length });
    return {
      id: r.id,
      name: r.name,
      vehicleNo: r.vehicleNo,
      driverName: r.driverName,
      driverPhone: r.driverPhone,
      attendantName: r.attendantName,
      capacity: r.capacity,
      isActive: r.isActive,
      onBoard: r.students.length,
      removable: guard.allowed,
      whyNot: guard.reason,
      stops: r.stops.map((s) => {
        const stopGuard = canDeleteStop({ students: s._count.students });
        return {
          id: s.id,
          name: s.name,
          monthlyFee: s.monthlyFee,
          pickupTime: s.pickupTime,
          dropTime: s.dropTime,
          students: s._count.students,
          removable: stopGuard.allowed,
          whyNot: stopGuard.reason,
        };
      }),
      students: r.students.map((st) => ({
        studentTransportId: st.id,
        fromDate: st.fromDate,
        student: {
          id: st.student.id,
          name: st.student.name,
          class: st.student.class?.name ?? null,
          section: st.student.section?.name ?? null,
        },
        stop: st.stop ? { id: st.stop.id, name: st.stop.name, monthlyFee: st.stop.monthlyFee } : null,
      })),
    };
  });
}
