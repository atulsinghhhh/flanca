"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check, CheckCheck, CloudOff, Clock, Lock, Loader2, MinusCircle, TriangleAlert, X,
} from "lucide-react";
import type { AttendanceStatus } from "@prisma/client";
import { Button } from "@/components/ui/primitives";
import { saveAttendance } from "../actions";

type Student = {
  id: string;
  name: string;
  rollNumber: number | null;
  admissionNumber: string;
  status: AttendanceStatus | null;
  priorAbsences: number;
};

type Marks = Record<string, AttendanceStatus>;

const OTHER_STATUSES: Array<{ value: AttendanceStatus; label: string; icon: React.ElementType }> = [
  { value: "LATE", label: "Late", icon: Clock },
  { value: "HALF_DAY", label: "Half day", icon: MinusCircle },
  { value: "LEAVE", label: "On leave", icon: MinusCircle },
];

/** Marks held on the device survive a refresh, a crash, or a dead connection. */
function storageKey(sectionId: string, date: string) {
  return `flanca:att:${sectionId}:${date}`;
}

export function MarkSheet({
  sectionId,
  date,
  students,
  alreadyMarked,
  locked = false,
}: {
  sectionId: string;
  date: string;
  students: Student[];
  alreadyMarked: boolean;
  /** This day is already saved and locked for this viewer — read only. */
  locked?: boolean;
}) {
  const router = useRouter();

  // Everyone starts present. In a real school almost everyone IS present, so the
  // teacher should only ever have to touch the exceptions.
  const [marks, setMarks] = useState<Marks>(() =>
    Object.fromEntries(students.map((s) => [s.id, s.status ?? "PRESENT"])) as Marks,
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const restored = useRef(false);

  // ── restore anything this device saved but never managed to send
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    setOnline(navigator.onLine);

    try {
      const raw = localStorage.getItem(storageKey(sectionId, date));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { marks: Marks; pending: boolean };
      if (parsed.marks) {
        setMarks((current) => ({ ...current, ...parsed.marks }));
        if (parsed.pending) setQueued(true);
      }
    } catch {
      // A corrupt local cache must never block marking.
    }
  }, [sectionId, date]);

  const persist = useCallback(
    (next: Marks, pending: boolean) => {
      try {
        localStorage.setItem(storageKey(sectionId, date), JSON.stringify({ marks: next, pending }));
      } catch {
        // Private browsing or a full disk — marking still works, just not offline.
      }
    },
    [sectionId, date],
  );

  const submit = useCallback(
    async (next: Marks, silent = false) => {
      if (!silent) setSaving(true);
      setError(null);

      try {
        const result = await saveAttendance({
          sectionId,
          date,
          marks: Object.entries(next).map(([studentId, status]) => ({ studentId, status })),
        });

        if (result.error) {
          // The server ANSWERED and said no. That is not the same as a dropped
          // connection: queueing it would leave the marks waiting for a sync that
          // can never succeed, while the teacher is told they are safe. Keep them on
          // the device so nothing typed is lost, show what the school said, and do
          // not promise a sync.
          setError(result.error);
          persist(next, false);
          setQueued(false);
          return false;
        }

        setSavedAt(new Date());
        setQueued(false);
        persist(next, false);
        router.refresh();
        return true;
      } catch {
        // No connection. The marks are safe on the device and will go up later.
        persist(next, true);
        setQueued(true);
        return false;
      } finally {
        if (!silent) setSaving(false);
      }
    },
    [sectionId, date, persist, router],
  );

  // ── when the connection comes back, send what is waiting, without being asked
  useEffect(() => {
    function goOnline() {
      setOnline(true);
      if (queued) void submit(marks, true);
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [queued, marks, submit]);

  function set(studentId: string, status: AttendanceStatus) {
    if (locked) return;
    setMarks((prev) => {
      const next = { ...prev, [studentId]: status };
      persist(next, true);
      return next;
    });
    setMenuFor(null);
  }

  function toggle(studentId: string) {
    const current = marks[studentId] ?? "PRESENT";
    set(studentId, current === "PRESENT" ? "ABSENT" : "PRESENT");
  }

  const counts = useMemo(() => {
    const values = Object.values(marks);
    return {
      present: values.filter((v) => v === "PRESENT").length,
      absent: values.filter((v) => v === "ABSENT").length,
      late: values.filter((v) => v === "LATE").length,
      other: values.filter((v) => v === "LEAVE" || v === "HALF_DAY").length,
    };
  }, [marks]);

  return (
    <>
      {/* ── locked: saved once, now read only for this viewer ── */}
      {locked ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line-2 bg-paper-2 px-4 py-2.5 text-[13px] text-ink-2">
          <Lock className="size-4 shrink-0" />
          <p>Attendance marked — locked. Ask the office to correct it.</p>
        </div>
      ) : null}

      {/* ── connection banner: honest about where the marks are ── */}
      {!locked && (!online || queued) ? (
        <div
          className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-4 py-2.5 text-[13px] ${
            online
              ? "border-marigold/35 bg-marigold-light text-marigold-ink-strong"
              : "border-info/25 bg-info-light text-info"
          }`}
        >
          <CloudOff className="size-4 shrink-0" />
          <p>
            {online
              ? "Some marks are still waiting to sync. They are saved on this device — nothing is lost."
              : "You are offline. Keep marking — everything is saved on this device and will sync by itself when the connection returns."}
          </p>
        </div>
      ) : null}

      <div className="card overflow-hidden">
        {/* ── quick actions ── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <button
            disabled={locked}
            onClick={() => {
              const next = Object.fromEntries(students.map((s) => [s.id, "PRESENT"])) as Marks;
              setMarks(next);
              persist(next, true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-line-2 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCheck className="size-3.5" /> All present
          </button>
          <p className="text-[12.5px] text-ink-3">
            Everyone starts present — tap only the students who are absent.
          </p>
        </div>

        {/* ── the roll ── */}
        <ul className="divide-y divide-line">
          {students.map((s) => {
            const status = marks[s.id] ?? "PRESENT";
            const isPresent = status === "PRESENT";
            const isAbsent = status === "ABSENT";

            return (
              <li key={s.id} className="relative">
                <div className="flex items-center gap-3 px-3 py-2 sm:px-4">
                  {/* the one tap */}
                  <button
                    disabled={locked}
                    onClick={() => toggle(s.id)}
                    aria-label={`${s.name} is ${isPresent ? "present" : status.toLowerCase()} — tap to change`}
                    className={`flex size-11 shrink-0 items-center justify-center rounded-lg border-2 transition-colors disabled:cursor-not-allowed ${
                      isPresent
                        ? "border-good/30 bg-good-light text-good"
                        : isAbsent
                          ? "border-overdue/40 bg-overdue-light text-overdue"
                          : "border-marigold/40 bg-marigold-light text-marigold-ink"
                    }`}
                  >
                    {isPresent ? (
                      <Check className="size-5" strokeWidth={3} />
                    ) : isAbsent ? (
                      <X className="size-5" strokeWidth={3} />
                    ) : (
                      <span className="text-[11px] font-bold">
                        {status === "LATE" ? "L" : status === "HALF_DAY" ? "½" : "LV"}
                      </span>
                    )}
                  </button>

                  <button onClick={() => toggle(s.id)} className="min-w-0 flex-1 text-left">
                    <p className="flex items-center gap-2 text-[15px] font-medium">
                      <span className="tnum w-6 shrink-0 text-[13px] text-ink-3">
                        {s.rollNumber ?? "—"}
                      </span>
                      <span className="truncate">{s.name}</span>
                    </p>
                    {s.priorAbsences >= 2 ? (
                      <p className="mt-0.5 flex items-center gap-1 pl-8 text-[11.5px] text-overdue">
                        <TriangleAlert className="size-3" /> absent the last {s.priorAbsences} days
                      </p>
                    ) : null}
                  </button>

                  {!locked ? (
                    <button
                      onClick={() => setMenuFor(menuFor === s.id ? null : s.id)}
                      className="shrink-0 rounded-md px-2.5 py-2 text-[12.5px] font-semibold text-ink-3 hover:bg-paper-2 hover:text-ink"
                    >
                      Other
                    </button>
                  ) : null}
                </div>

                {menuFor === s.id ? (
                  <div className="flex flex-wrap gap-2 border-t border-line bg-paper-2/60 px-4 py-2">
                    {OTHER_STATUSES.map((o) => {
                      const Icon = o.icon;
                      return (
                        <button
                          key={o.value}
                          onClick={() => set(s.id, o.value)}
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] font-semibold ${
                            status === o.value
                              ? "border-brand bg-brand-light text-brand-ink"
                              : "border-line-2 bg-white hover:bg-paper-2"
                          }`}
                        >
                          <Icon className="size-3.5" /> {o.label}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setMenuFor(null)}
                      className="ml-auto text-[12.5px] font-semibold text-ink-3 hover:text-ink"
                    >
                      Close
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── sticky save bar: reachable with a thumb ── */}
      <div className="sticky bottom-0 z-20 mt-4 -mx-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
            <span className="font-semibold text-good">{counts.present} present</span>
            <span className={counts.absent > 0 ? "font-semibold text-overdue" : "text-ink-3"}>
              {counts.absent} absent
            </span>
            {counts.late > 0 ? <span className="text-marigold-ink">{counts.late} late</span> : null}
            {counts.other > 0 ? <span className="text-ink-3">{counts.other} leave</span> : null}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {savedAt && !queued ? (
              <p className="flex items-center gap-1.5 text-[12.5px] text-good">
                <Check className="size-3.5" /> Saved{" "}
                {savedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
              </p>
            ) : null}
            {!locked ? (
              <Button size="lg" onClick={() => submit(marks)} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {saving ? "Saving…" : alreadyMarked ? "Update attendance" : "Save attendance"}
              </Button>
            ) : (
              <p className="flex items-center gap-1.5 text-[13px] text-ink-3">
                <Lock className="size-3.5" /> Locked
              </p>
            )}
          </div>
        </div>

        {error ? (
          <p className="mt-2 text-[12.5px] text-overdue">{error}</p>
        ) : null}
      </div>
    </>
  );
}
