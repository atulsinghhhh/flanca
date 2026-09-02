import Link from "next/link";
import { BedDouble, UtensilsCrossed } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { canDeleteRoom } from "@/lib/core/operations-core";
import { Badge, Card, CardHead, Empty, Meter, PageHead, Stat } from "@/components/ui/primitives";
import { AllotBed, EndAllotmentButton, HostelEditor } from "./hostel-editor";
import type { RoomRow } from "./hostel-editor";

export const metadata = { title: "Hostel — Flanca" };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MEALS = ["BREAKFAST", "LUNCH", "SNACKS", "DINNER"];

export default async function HostelPage() {
  const actor = await requireRole(...OFFICE);

  const [rooms, menus] = await Promise.all([
    db.hostelRoom.findMany({
      where: { schoolId: actor.schoolId },
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
    }),
    db.messMenu.findMany({ where: { schoolId: actor.schoolId } }),
  ]);

  const roomRows: RoomRow[] = await Promise.all(
    rooms.map(async (r) => {
      // Ever-lived-in, not currently-in: a room somebody has stayed in keeps its
      // record, so the guard counts every allotment rather than the open ones.
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
      };
    }),
  );

  const beds = rooms.reduce((a, r) => a + r.capacity, 0);
  const occupied = rooms.reduce((a, r) => a + r.allotments.length, 0);
  const menuByKey = new Map(menus.map((m) => [`${m.dayOfWeek}-${m.meal}`, m.items]));

  return (
    <>
      <PageHead
        eyebrow="School"
        title="Hostel"
        sub="Rooms, who is in them, and the mess menu parents ask about."
        actions={<AllotBed rooms={roomRows} />}
      />

      <HostelEditor rooms={roomRows} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Rooms" value={rooms.length} sub={`${beds} beds`} icon={<BedDouble className="size-4" />} />
        <Stat
          label="Residents"
          value={occupied}
          tone={beds > 0 && occupied >= beds ? "warn" : "good"}
          sub={beds > 0 ? `${beds - occupied} beds free` : "no capacity recorded"}
        />
        <Stat
          label="Occupancy"
          value={beds > 0 ? `${Math.round((occupied / beds) * 100)}%` : "—"}
          sub="of available beds"
        />
      </div>

      {rooms.length === 0 ? (
        <Card className="mt-5">
          <Empty
            title="No hostel recorded"
            hint="Most day schools have none — add rooms only if your school boards students."
          />
        </Card>
      ) : (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_360px]">
          <Card className="overflow-hidden">
            <CardHead title="Rooms" hint="Occupancy against capacity" />
            <ul className="divide-y divide-line">
              {rooms.map((r) => {
                const fillBp = r.capacity > 0 ? Math.round((r.allotments.length / r.capacity) * 10000) : 0;
                return (
                  <li key={r.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[14px] font-semibold">
                          {r.block ? `${r.block} · ` : ""}
                          Room {r.roomNo}
                        </p>
                        <p className="mt-0.5 text-[11.5px] text-ink-3">
                          {r.kind ? `${r.kind.toLowerCase()} · ` : ""}
                          {r.wardenName ? `Warden ${r.wardenName}` : "no warden recorded"}
                        </p>
                      </div>
                      <div className="w-32">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[11.5px] text-ink-3">Beds</span>
                          <span className="tnum text-[12.5px] font-semibold">
                            {r.allotments.length}/{r.capacity}
                          </span>
                        </div>
                        <Meter valueBp={fillBp} tone={fillBp >= 10000 ? "warn" : "brand"} className="mt-1" />
                      </div>
                    </div>

                    {r.allotments.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {r.allotments.map((a) => (
                          <li key={a.id} className="inline-flex items-center gap-1">
                            <Link
                              href={`/app/students/${a.student.id}`}
                              className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-white px-2.5 py-1 text-[12px] hover:border-brand hover:text-brand"
                            >
                              {a.student.name}
                              <span className="text-ink-3">
                                {a.student.class?.name ?? ""}
                                {a.student.section ? ` ${a.student.section.name}` : ""}
                              </span>
                            </Link>
                            <EndAllotmentButton allotmentId={a.id} studentName={a.student.name} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-[12px] text-ink-3">Empty</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="overflow-hidden">
            <CardHead
              title="Mess menu"
              hint="The question parents ask most"
              action={<UtensilsCrossed className="size-4 text-ink-3" />}
            />
            {menus.length === 0 ? (
              <Empty title="No menu set" />
            ) : (
              <div className="overflow-x-auto">
                <table className="ruled w-full min-w-[320px]">
                  <thead>
                    <tr>
                      <th>Day</th>
                      {MEALS.map((m) => (
                        <th key={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map((d, i) => (
                      <tr key={d}>
                        <td data-title className="font-medium whitespace-nowrap">{d.slice(0, 3)}</td>
                        {MEALS.map((m) => (
                          <td
                            key={m}
                            data-label={m.charAt(0) + m.slice(1).toLowerCase()}
                            className="text-[12px] text-ink-2"
                          >
                            {menuByKey.get(`${i + 1}-${m}`) ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
