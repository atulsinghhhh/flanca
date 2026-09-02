"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, Check, Loader2, LogOut, Plus, Trash2, UserPlus, X } from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/components/ui/primitives";
import { validateRoom } from "@/lib/core/operations-core";
import { allotBed, deleteRoom, endAllotment, saveRoom, searchStudentsForAllot } from "./actions";

export type RoomRow = {
  id: string;
  roomNo: string;
  block: string | null;
  capacity: number;
  kind: string | null;
  wardenName: string | null;
  occupied: number;
  removable: boolean;
  whyNot: string | null;
};

const INPUT = "h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

/** Rooms and beds. Capacity is the whole reason the record exists. */
export function HostelEditor({ rooms }: { rooms: RoomRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ roomNo: "", block: "", capacity: "2", kind: "", warden: "" });

  const live = validateRoom({
    roomNo: form.roomNo,
    capacity: form.capacity.trim() === "" ? null : Number(form.capacity),
    kind: form.kind || null,
    existingRoomNos: rooms.filter((r) => r.id !== editing).map((r) => r.roomNo),
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

  function reset() {
    setForm({ roomNo: "", block: "", capacity: "2", kind: "", warden: "" });
    setEditing(null);
    setOpen(false);
  }

  return (
    <Card className="mt-5">
      <CardHead
        title="Rooms"
        hint="A room cannot hold more children than it has beds, and a boys' room is for boys."
        action={
          <button
            onClick={() => {
              setOpen(!open);
              setEditing(null);
            }}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand"
          >
            {open ? <X className="size-3.5" /> : <Plus className="size-3.5" />} {open ? "Close" : "New room"}
          </button>
        }
      />

      {error ? (
        <p className="mx-5 mt-4 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13.5px] text-overdue">
          {error}
        </p>
      ) : null}

      {open ? (
        <div className="border-b border-line px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Room</span>
              <input value={form.roomNo} onChange={(e) => setForm({ ...form, roomNo: e.target.value })} placeholder="B-12" className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Block</span>
              <input value={form.block} onChange={(e) => setForm({ ...form, block: e.target.value })} placeholder="North" className={INPUT} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Beds</span>
              <input
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value.replace(/\D/g, "") })}
                inputMode="numeric"
                className={INPUT}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">For</span>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={INPUT}>
                <option value="">Not recorded</option>
                <option value="BOYS">Boys</option>
                <option value="GIRLS">Girls</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-semibold">Warden</span>
              <input value={form.warden} onChange={(e) => setForm({ ...form, warden: e.target.value })} className={INPUT} />
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
                    saveRoom({
                      roomId: editing,
                      roomNo: form.roomNo,
                      block: form.block,
                      capacity: Number(form.capacity),
                      kind: form.kind || null,
                      wardenName: form.warden,
                    }),
                  reset,
                )
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {editing ? "Save room" : "Add room"}
            </Button>
            <button onClick={reset} className="text-[13px] font-semibold text-ink-3">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <ul className="divide-y divide-line">
        {rooms.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
            <BedDouble className="size-4 shrink-0 text-ink-3" />
            <span className="text-[13.5px] font-semibold">{r.roomNo}</span>
            {r.block ? <span className="text-[12px] text-ink-3">{r.block} block</span> : null}
            {r.kind ? <Badge tone="neutral">{r.kind === "BOYS" ? "Boys" : "Girls"}</Badge> : null}
            <Badge tone={r.occupied >= r.capacity ? "warn" : "good"}>
              {r.occupied} of {r.capacity} beds
            </Badge>
            {r.wardenName ? <span className="text-[12px] text-ink-3">Warden {r.wardenName}</span> : null}

            <span className="ml-auto flex items-center gap-2.5">
              <button
                onClick={() => {
                  setEditing(r.id);
                  setOpen(true);
                  setForm({
                    roomNo: r.roomNo,
                    block: r.block ?? "",
                    capacity: String(r.capacity),
                    kind: r.kind ?? "",
                    warden: r.wardenName ?? "",
                  });
                }}
                className="text-[13px] font-semibold text-ink-2 hover:text-brand"
              >
                Edit
              </button>
              <button
                onClick={() => (r.removable ? run(() => deleteRoom({ roomId: r.id })) : setError(r.whyNot))}
                title={r.whyNot ?? `Remove ${r.roomNo}`}
                className={r.removable ? "text-overdue hover:text-overdue/80" : "text-ink-3"}
              >
                {r.removable ? <Trash2 className="size-3.5" /> : <X className="size-3.5" />}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

type StudentMatch = { id: string; name: string; sub: string };

/** Give a child a bed. The server enforces capacity, gender and one-room-at-a-time. */
export function AllotBed({ rooms }: { rooms: RoomRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<StudentMatch[]>([]);
  const [student, setStudent] = useState<StudentMatch | null>(null);
  const [roomId, setRoomId] = useState("");
  const [bedNo, setBedNo] = useState("");

  useEffect(() => {
    if (student || !studentQuery.trim()) {
      setStudentResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchStudentsForAllot(studentQuery).then(setStudentResults);
    }, 250);
    return () => clearTimeout(t);
  }, [studentQuery, student]);

  function reset() {
    setStudent(null);
    setStudentQuery("");
    setRoomId("");
    setBedNo("");
  }

  function submit() {
    if (!student || !roomId) return;
    setError(null);
    setDone(null);
    start(async () => {
      const r = await allotBed({ studentId: student.id, roomId, bedNo: bedNo || null });
      if (r.error) {
        setError(r.error);
        return;
      }
      setDone(`${student.name} allotted a bed`);
      reset();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold text-ink-2 hover:border-brand hover:text-brand"
      >
        <UserPlus className="size-3.5" /> Allot a bed
      </button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-md border border-line-2 bg-paper-2 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <label className="eyebrow text-ink-3 mb-1 block">Student</label>
          {student ? (
            <div className="flex h-9 items-center justify-between rounded-md border border-line-2 bg-white px-2.5 text-[13.5px]">
              <span className="truncate">
                {student.name} <span className="text-ink-3">· {student.sub}</span>
              </span>
              <button
                type="button"
                onClick={() => setStudent(null)}
                className="ml-2 shrink-0 text-[12px] font-semibold text-brand hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <input
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="Search student by name"
              className={INPUT}
            />
          )}
          {!student && studentResults.length > 0 ? (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-line-2 bg-white shadow-md">
              {studentResults.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setStudent(s);
                      setStudentResults([]);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-[13px] hover:bg-paper-2"
                  >
                    <span className="min-w-0 truncate">{s.name}</span>
                    <span className="shrink-0 text-[11.5px] text-ink-3">{s.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <label>
          <span className="eyebrow text-ink-3 mb-1 block">Room</span>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={`${INPUT} sm:w-44`}>
            <option value="">Choose a room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id} disabled={r.occupied >= r.capacity}>
                {r.block ? `${r.block} · ` : ""}
                {r.roomNo} ({r.occupied}/{r.capacity}
                {r.kind ? `, ${r.kind === "BOYS" ? "boys" : "girls"}` : ""})
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="eyebrow text-ink-3 mb-1 block">Bed no.</span>
          <input
            value={bedNo}
            onChange={(e) => setBedNo(e.target.value)}
            placeholder="Optional"
            className={`${INPUT} sm:w-28`}
          />
        </label>
      </div>

      {error ? <p className="text-[12.5px] text-overdue">{error}</p> : null}
      {done ? <p className="text-[12.5px] text-good">{done}</p> : null}

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending || !student || !roomId}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          Allot bed
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Close
        </Button>
      </div>
    </div>
  );
}

/** A child leaving the hostel. The allotment stays, with an end date. */
export function EndAllotmentButton({ allotmentId, studentName }: { allotmentId: string; studentName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function leave() {
    if (!window.confirm(`Mark ${studentName} as having left the hostel? The bed becomes free.`)) return;
    start(async () => {
      await endAllotment({ allotmentId });
      router.refresh();
    });
  }

  return (
    <button
      onClick={leave}
      disabled={pending}
      title={`End ${studentName}'s allotment`}
      className="shrink-0 rounded-md p-1 text-ink-3 transition-colors hover:bg-overdue-light hover:text-overdue disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
    </button>
  );
}
