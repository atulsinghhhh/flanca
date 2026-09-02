"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bus, Check, Loader2, MapPin, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/core/money";
import { validateRoute } from "@/lib/core/operations-core";
import { boardStudent, createRoute, deleteRoute, deleteStop, saveStop, searchStudents, unboardStudent, updateRoute } from "./actions";

export type StopRow = {
  id: string;
  name: string;
  monthlyFee: number;
  students: number;
  removable: boolean;
  whyNot: string | null;
};

export type RouteRow = {
  id: string;
  name: string;
  vehicleNo: string | null;
  driverName: string | null;
  driverPhone: string | null;
  capacity: number | null;
  onBoard: number;
  stops: StopRow[];
  removable: boolean;
  whyNot: string | null;
};

const INPUT = "h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

/**
 * The buses, the stops, and what each stop costs a month.
 *
 * The fee here is the number that lands on a parent's invoice as the Transport line,
 * so changing it says out loud how many families it affects.
 */
export function TransportEditor({ routes }: { routes: RouteRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingRoute, setEditingRoute] = useState<string | null>(null);
  const [stopFor, setStopFor] = useState<string | null>(null);
  const [editingStop, setEditingStop] = useState<string | null>(null);

  const [route, setRoute] = useState({ name: "", vehicleNo: "", driverName: "", driverPhone: "", capacity: "" });
  const [stop, setStop] = useState({ name: "", fee: "", pickup: "" });

  const live = validateRoute({
    name: route.name,
    vehicleNo: route.vehicleNo || null,
    capacity: route.capacity.trim() === "" ? null : Number(route.capacity),
    driverPhone: route.driverPhone || null,
    existingNames: routes.filter((r) => r.id !== editingRoute).map((r) => r.name),
  });

  function run(fn: () => Promise<{ error?: string } | undefined>, after?: () => void) {
    setError(null);
    start(async () => {
      const r = (await fn()) ?? {};
      if (r.error) {
        setError(r.error);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  function resetRoute() {
    setRoute({ name: "", vehicleNo: "", driverName: "", driverPhone: "", capacity: "" });
    setAdding(false);
    setEditingRoute(null);
  }

  return (
    <Card className="mt-5">
      <CardHead
        title="Routes & stops"
        hint="A stop's monthly fee is what appears on the invoice of every child picked up there."
        action={
          <button
            onClick={() => {
              setAdding(!adding);
              setEditingRoute(null);
              setRoute({ name: "", vehicleNo: "", driverName: "", driverPhone: "", capacity: "" });
            }}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand"
          >
            {adding ? <X className="size-3.5" /> : <Plus className="size-3.5" />} {adding ? "Close" : "New route"}
          </button>
        }
      />

      {error ? (
        <p className="mx-5 mt-4 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13.5px] text-overdue">
          {error}
        </p>
      ) : null}

      {adding || editingRoute ? (
        <div className="border-b border-line px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Route</span>
              <input value={route.name} onChange={(e) => setRoute({ ...route, name: e.target.value })} placeholder="Kolar Road" className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Vehicle</span>
              <input value={route.vehicleNo} onChange={(e) => setRoute({ ...route, vehicleNo: e.target.value })} placeholder="MP04 AB 1234" className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Driver</span>
              <input value={route.driverName} onChange={(e) => setRoute({ ...route, driverName: e.target.value })} className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Driver's mobile</span>
              <input value={route.driverPhone} onChange={(e) => setRoute({ ...route, driverPhone: e.target.value })} inputMode="numeric" className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Seats</span>
              <input
                value={route.capacity}
                onChange={(e) => setRoute({ ...route, capacity: e.target.value.replace(/\D/g, "") })}
                inputMode="numeric"
                placeholder="40"
                className={INPUT}
              />
            </label>
          </div>

          {live.messages.length > 0 ? (
            <ul className="mt-2.5 space-y-1">
              {live.messages.map((m, i) => (
                <li key={i} className={`text-[12.5px] ${m.level === "ERROR" ? "text-overdue" : "text-marigold"}`}>
                  {m.message}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3 flex items-center gap-3">
            <Button
              size="sm"
              disabled={pending || !live.ok}
              onClick={() =>
                run(
                  () =>
                    editingRoute
                      ? updateRoute({
                          routeId: editingRoute,
                          name: route.name,
                          vehicleNo: route.vehicleNo,
                          driverName: route.driverName,
                          driverPhone: route.driverPhone,
                          capacity: route.capacity.trim() === "" ? null : Number(route.capacity),
                        })
                      : createRoute({
                          name: route.name,
                          vehicleNo: route.vehicleNo,
                          driverName: route.driverName,
                          driverPhone: route.driverPhone,
                          capacity: route.capacity.trim() === "" ? null : Number(route.capacity),
                        }),
                  resetRoute,
                )
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {editingRoute ? "Save route" : "Add route"}
            </Button>
            <button onClick={resetRoute} className="text-[13px] font-semibold text-ink-3">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <ul className="divide-y divide-line">
        {routes.map((r) => (
          <li key={r.id} className="px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Bus className="size-4 shrink-0 text-ink-3" />
              <span className="text-[14px] font-semibold">{r.name}</span>
              {r.vehicleNo ? <span className="font-mono text-[11.5px] text-ink-3">{r.vehicleNo}</span> : null}
              <Badge tone={r.capacity != null && r.onBoard >= r.capacity ? "warn" : "neutral"}>
                {r.onBoard}
                {r.capacity != null ? ` of ${r.capacity}` : ""} on board
              </Badge>
              {r.driverName ? (
                <span className="text-[12px] text-ink-3">
                  {r.driverName}
                  {r.driverPhone ? ` · ${r.driverPhone}` : ""}
                </span>
              ) : null}

              <span className="ml-auto flex items-center gap-2.5">
                <button
                  onClick={() => {
                    setEditingRoute(r.id);
                    setAdding(false);
                    setRoute({
                      name: r.name,
                      vehicleNo: r.vehicleNo ?? "",
                      driverName: r.driverName ?? "",
                      driverPhone: r.driverPhone ?? "",
                      capacity: r.capacity != null ? String(r.capacity) : "",
                    });
                  }}
                  className="text-[13px] font-semibold text-ink-2 hover:text-brand"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    setStopFor(stopFor === r.id ? null : r.id);
                    setEditingStop(null);
                    setStop({ name: "", fee: "", pickup: "" });
                  }}
                  className="flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-brand"
                >
                  <MapPin className="size-3.5" /> Stop
                </button>
                <button
                  onClick={() => (r.removable ? run(() => deleteRoute({ routeId: r.id })) : setError(r.whyNot))}
                  title={r.whyNot ?? `Remove ${r.name}`}
                  className={r.removable ? "text-overdue hover:text-overdue/80" : "text-ink-3"}
                >
                  {r.removable ? <Trash2 className="size-3.5" /> : <X className="size-3.5" />}
                </button>
              </span>
            </div>

            {stopFor === r.id ? (
              <div className="mt-2.5 flex flex-wrap items-end gap-2 rounded-md border border-line bg-paper-2/50 px-3 py-2.5">
                <label>
                  <span className="mb-1 block text-[12.5px] font-semibold">{editingStop ? "Stop" : "New stop"}</span>
                  <input value={stop.name} onChange={(e) => setStop({ ...stop, name: e.target.value })} placeholder="Ashoka Garden" className={`${INPUT} w-44`} />
                </label>
                <label>
                  <span className="mb-1 block text-[12.5px] font-semibold">A month</span>
                  <input value={stop.fee} onChange={(e) => setStop({ ...stop, fee: e.target.value })} inputMode="decimal" placeholder="800" className={`${INPUT} w-28`} />
                </label>
                <label>
                  <span className="mb-1 block text-[12.5px] font-semibold">Pickup</span>
                  <input value={stop.pickup} onChange={(e) => setStop({ ...stop, pickup: e.target.value })} placeholder="07:15" className={`${INPUT} w-24`} />
                </label>
                <Button
                  size="sm"
                  disabled={pending || !stop.name.trim()}
                  onClick={() =>
                    run(
                      () =>
                        saveStop({
                          stopId: editingStop,
                          routeId: r.id,
                          name: stop.name,
                          monthlyFeeText: stop.fee,
                          pickupTime: stop.pickup,
                        }),
                      () => {
                        setStop({ name: "", fee: "", pickup: "" });
                        setEditingStop(null);
                      },
                    )
                  }
                >
                  {editingStop ? "Save stop" : "Add stop"}
                </Button>
                <button
                  onClick={() => {
                    setStopFor(null);
                    setEditingStop(null);
                  }}
                  className="text-[13px] font-semibold text-ink-3"
                >
                  Done
                </button>
              </div>
            ) : null}

            {r.stops.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {r.stops.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-[12.5px]"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-ink-3">{formatMoney(s.monthlyFee)}/mo</span>
                    <span className="text-ink-3">· {s.students}</span>
                    <button
                      onClick={() => {
                        setStopFor(r.id);
                        setEditingStop(s.id);
                        setStop({ name: s.name, fee: String(s.monthlyFee / 100), pickup: "" });
                      }}
                      className="text-ink-3 hover:text-brand"
                      aria-label={`Edit ${s.name}`}
                    >
                      <Check className="size-3" />
                    </button>
                    <button
                      onClick={() => (s.removable ? run(() => deleteStop({ stopId: s.id })) : setError(s.whyNot))}
                      title={s.whyNot ?? `Remove ${s.name}`}
                      className={s.removable ? "text-overdue hover:text-overdue/80" : "text-ink-3"}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[12px] text-ink-3">
                No stops yet. A child's transport fee comes from their stop, so this route bills nothing
                until it has some.
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

type StudentMatch = { id: string; name: string; sub: string };

export function BoardStudentForm({ routeId, stops }: { routeId: string; stops: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentMatch[]>([]);
  const [student, setStudent] = useState<StudentMatch | null>(null);
  const [stopId, setStopId] = useState("");

  useEffect(() => {
    if (student || !query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchStudents(query).then(setResults);
    }, 250);
    return () => clearTimeout(t);
  }, [query, student]);

  function reset() {
    setStudent(null);
    setQuery("");
    setResults([]);
    setStopId("");
    setOpen(false);
    setError(null);
  }

  function board() {
    if (!student) return;
    setError(null);
    start(async () => {
      const r = (await boardStudent({ studentId: student.id, routeId, stopId: stopId || null })) ?? {};
      if (r.error) {
        setError(r.error);
        return;
      }
      reset();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mx-5 mt-1.5 mb-3 flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-brand"
      >
        <Plus className="size-3.5" /> Board a student
      </button>
    );
  }

  return (
    <div className="mx-5 mt-1.5 mb-3 rounded-md border border-line bg-paper-2/50 px-3 py-2.5">
      {error ? <p className="mb-2 text-[12.5px] text-overdue">{error}</p> : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative">
          <span className="mb-1 block text-[12.5px] font-semibold">Student</span>
          {student ? (
            <div className="flex h-9 w-48 items-center justify-between rounded-md border border-line-2 bg-white px-2.5 text-[13.5px]">
              <span className="truncate">{student.name}</span>
              <button onClick={() => setStudent(null)} className="ml-2 shrink-0 text-ink-3 hover:text-brand">
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name"
              className={`${INPUT} w-48`}
            />
          )}
          {!student && results.length > 0 ? (
            <ul className="absolute z-10 mt-1 w-56 rounded-md border border-line-2 bg-white shadow-md">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => {
                      setStudent(r);
                      setResults([]);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-paper-2"
                  >
                    <span className="min-w-0 truncate text-[13px] font-medium">{r.name}</span>
                    <span className="shrink-0 text-[11.5px] text-ink-3">{r.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <label>
          <span className="mb-1 block text-[12.5px] font-semibold">Stop</span>
          <select value={stopId} onChange={(e) => setStopId(e.target.value)} className={`${INPUT} w-40`}>
            <option value="">No stop</option>
            {stops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" disabled={pending || !student} onClick={board}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Board
        </Button>
        <button onClick={reset} className="text-[13px] font-semibold text-ink-3">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function UnboardButton({ studentTransportId }: { studentTransportId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      disabled={pending}
      title="Remove from route"
      onClick={() =>
        start(async () => {
          await unboardStudent({ studentTransportId });
          router.refresh();
        })
      }
      className="text-ink-3 hover:text-overdue disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
    </button>
  );
}
