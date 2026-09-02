import { db } from "@/lib/db";
import { canDeleteRoom } from "@/lib/core/operations-core";

export type HostelRoomRow = {
  id: string;
  roomNo: string;
  block: string | null;
  capacity: number;
  kind: string | null;
  wardenName: string | null;
  occupied: number;
  removable: boolean;
  whyNot: string | null;
  allotments: {
    id: string;
    bedNo: string | null;
    fromDate: Date;
    student: { id: string; name: string; class: string | null; section: string | null };
  }[];
};

/**
 * Rooms with who is in them right now — the mobile twin of
 * src/app/app/hostel/page.tsx's room list (same query shape, same
 * ever-allotted `removable` guard), minus the mess-menu half of that page,
 * which is not a desk action a phone needs.
 */
export async function getHostelRooms(schoolId: string): Promise<HostelRoomRow[]> {
  const rooms = await db.hostelRoom.findMany({
    where: { schoolId },
    orderBy: [{ block: "asc" }, { roomNo: "asc" }],
    include: {
      allotments: {
        where: { toDate: null },
        include: {
          student: {
            select: { id: true, name: true, class: { select: { name: true } }, section: { select: { name: true } } },
          },
        },
      },
    },
  });

  return Promise.all(
    rooms.map(async (r) => {
      // Ever-lived-in, not currently-in — same as the page: a room somebody has
      // stayed in keeps its record, so the guard counts every allotment ever made.
      const everAllotted = await db.hostelAllotment.count({ where: { roomId: r.id } });
      const guard = canDeleteRoom({ allotments: everAllotted });
      return {
        id: r.id,
        roomNo: r.roomNo,
        block: r.block,
        capacity: r.capacity,
        kind: r.kind,
        wardenName: r.wardenName,
        occupied: r.allotments.length,
        removable: guard.allowed,
        whyNot: guard.reason,
        allotments: r.allotments.map((a) => ({
          id: a.id,
          bedNo: a.bedNo,
          fromDate: a.fromDate,
          student: {
            id: a.student.id,
            name: a.student.name,
            class: a.student.class?.name ?? null,
            section: a.student.section?.name ?? null,
          },
        })),
      };
    }),
  );
}
