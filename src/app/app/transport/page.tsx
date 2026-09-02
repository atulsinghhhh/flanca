import Link from "next/link";
import { Bus, MapPin, Phone, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireActor, hasRole, OFFICE } from "@/lib/session";
import { canDeleteRoute, canDeleteStop } from "@/lib/core/operations-core";
import { formatMoney } from "@/lib/core/money";
import { Badge, Card, CardHead, Empty, Meter, PageHead, Stat } from "@/components/ui/primitives";
import { BoardStudentForm, TransportEditor, UnboardButton } from "./transport-editor";
import type { RouteRow } from "./transport-editor";

export const metadata = { title: "Transport — Flanca" };

export default async function TransportPage() {
  const actor = await requireActor();

  const routes = await db.transportRoute.findMany({
    where: { schoolId: actor.schoolId, isActive: true },
    orderBy: { name: "asc" },
    include: {
      stops: { orderBy: { sequenceOrder: "asc" }, include: { _count: { select: { students: true } } } },
      students: {
        where: { toDate: null },
        include: {
          student: {
            select: { id: true, name: true, class: { select: { name: true } }, section: { select: { name: true } } },
          },
          stop: { select: { name: true, pickupTime: true, monthlyFee: true } },
        },
      },
    },
  });

  const office = hasRole(actor, ...OFFICE);
  const routeRows: RouteRow[] = routes.map((r) => {
    const guard = canDeleteRoute({ students: r.students.length, stops: r.stops.length });
    return {
      id: r.id,
      name: r.name,
      vehicleNo: r.vehicleNo,
      driverName: r.driverName,
      driverPhone: r.driverPhone,
      capacity: r.capacity,
      onBoard: r.students.length,
      stops: r.stops.map((s) => {
        const stopGuard = canDeleteStop({ students: s._count.students });
        return {
          id: s.id,
          name: s.name,
          monthlyFee: s.monthlyFee,
          students: s._count.students,
          removable: stopGuard.allowed,
          whyNot: stopGuard.reason,
        };
      }),
      removable: guard.allowed,
      whyNot: guard.reason,
    };
  });

  const riders = routes.reduce((a, r) => a + r.students.length, 0);
  const monthlyRevenue = routes.reduce(
    (a, r) => a + r.students.reduce((x, s) => x + (s.stop?.monthlyFee ?? 0), 0),
    0,
  );
  const seats = routes.reduce((a, r) => a + (r.capacity ?? 0), 0);

  return (
    <>
      <PageHead
        eyebrow="School"
        title="Transport"
        sub="Routes, stops and who rides them. Transport is charged per stop, so it only appears on the invoice of a child who actually uses the bus."
      />

      {office ? <TransportEditor routes={routeRows} /> : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Routes" value={routes.length} sub="active" icon={<Bus className="size-4" />} />
        <Stat
          label="Students riding"
          value={riders}
          sub={seats > 0 ? `${Math.round((riders / seats) * 100)}% of seats used` : "no capacity recorded"}
          icon={<Users className="size-4" />}
        />
        <Stat
          label="Stops"
          value={routes.reduce((a, r) => a + r.stops.length, 0)}
          icon={<MapPin className="size-4" />}
        />
        <Stat
          label="Monthly transport fee"
          value={formatMoney(monthlyRevenue)}
          sub="billed with the term invoice"
        />
      </div>

      {routes.length === 0 ? (
        <Card className="mt-5">
          <Empty title="No routes yet" hint="Add a route and its stops, then assign students." />
        </Card>
      ) : (
        <div className="mt-5 space-y-5">
          {routes.map((route) => {
            const used = route.students.length;
            const capacity = route.capacity ?? 0;
            const fillBp = capacity > 0 ? Math.round((used / capacity) * 10000) : 0;

            return (
              <Card key={route.id} className="overflow-hidden">
                <CardHead
                  title={route.name}
                  hint={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {route.vehicleNo ? <span className="font-mono">{route.vehicleNo}</span> : null}
                      {route.driverName ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" /> {route.driverName}
                          {route.driverPhone ? ` · ${route.driverPhone}` : ""}
                        </span>
                      ) : null}
                    </span>
                  }
                  action={
                    <div className="w-36">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11.5px] text-ink-3">Seats</span>
                        <span className="tnum text-[12.5px] font-semibold">
                          {used}
                          {capacity > 0 ? `/${capacity}` : ""}
                        </span>
                      </div>
                      {capacity > 0 ? (
                        <Meter valueBp={fillBp} tone={fillBp > 9500 ? "bad" : "brand"} className="mt-1" />
                      ) : null}
                    </div>
                  }
                />

                <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
                  <div className="border-b border-line lg:border-r lg:border-b-0">
                    <p className="eyebrow text-ink-3 px-5 pt-3 pb-1.5">Stops</p>
                    <ul className="divide-y divide-line">
                      {route.stops.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium">{s.name}</p>
                            <p className="text-[11.5px] text-ink-3">
                              {s.pickupTime ?? "—"}
                              {s.dropTime ? ` · drop ${s.dropTime}` : ""}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="tnum text-[12.5px] font-semibold">{formatMoney(s.monthlyFee)}</p>
                            <p className="text-[11px] text-ink-3">{s._count.students} riding</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="eyebrow text-ink-3 px-5 pt-3 pb-1.5">Students on this route</p>
                    {office ? (
                      <BoardStudentForm
                        routeId={route.id}
                        stops={route.stops.map((s) => ({ id: s.id, name: s.name }))}
                      />
                    ) : null}
                    {route.students.length === 0 ? (
                      <p className="px-5 pb-4 text-[13px] text-ink-3">Nobody assigned yet.</p>
                    ) : (
                      <div className="max-h-[280px] overflow-x-auto overflow-y-auto">
                        <table className="ruled w-full">
                          <thead>
                            <tr>
                              <th>Student</th>
                              <th>Class</th>
                              <th>Stop</th>
                              <th className="num">Fee</th>
                              {office ? <th /> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {route.students.map((s) => (
                              <tr key={s.id}>
                                <td data-title>
                                  <Link
                                    href={`/app/students/${s.student.id}`}
                                    className="font-medium hover:text-brand hover:underline"
                                  >
                                    {s.student.name}
                                  </Link>
                                </td>
                                <td data-label="Class" className="whitespace-nowrap text-ink-2">
                                  {s.student.class?.name ?? "—"}
                                  {s.student.section ? ` ${s.student.section.name}` : ""}
                                </td>
                                <td data-label="Stop" className="text-ink-2">{s.stop?.name ?? "—"}</td>
                                <td data-label="Fee" className="num">{formatMoney(s.stop?.monthlyFee ?? 0)}</td>
                                {office ? (
                                  <td className="text-right">
                                    <UnboardButton studentTransportId={s.id} />
                                  </td>
                                ) : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-5 rounded-lg border border-line bg-white px-4 py-3">
        <p className="text-[13px] text-ink-2">
          <strong>No GPS tracking.</strong> That needs a device in every bus and a subscription; we
          would rather ship stop-level pickup times and a driver phone number that actually work than
          a map that needs hardware you have not bought.
        </p>
      </div>
    </>
  );
}
