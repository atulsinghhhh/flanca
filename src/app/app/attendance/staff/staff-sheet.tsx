"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2, MinusCircle, X } from "lucide-react";
import type { AttendanceStatus } from "@prisma/client";
import { Button } from "@/components/ui/primitives";
import { saveStaffAttendance } from "../actions";

type Row = {
  id: string;
  name: string;
  employeeId: string;
  designation: string | null;
  status: AttendanceStatus | null;
  approvedLeave: string | null;
};

const OPTIONS: Array<{ value: AttendanceStatus; label: string; icon: React.ElementType; tone: string }> = [
  { value: "PRESENT", label: "Present", icon: Check, tone: "border-good/30 bg-good-light text-good" },
  { value: "ABSENT", label: "Absent", icon: X, tone: "border-overdue/40 bg-overdue-light text-overdue" },
  { value: "LATE", label: "Late", icon: Clock, tone: "border-marigold/40 bg-marigold-light text-marigold-ink" },
  { value: "LEAVE", label: "Leave", icon: MinusCircle, tone: "border-line-2 bg-paper-2 text-ink-2" },
];

export function StaffSheet({ date, rows }: { date: string; rows: Row[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  // Anyone on approved leave is pre-set to LEAVE — the office should not have to
  // re-enter a decision it has already made.
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(
      rows.map((r) => [r.id, r.status ?? (r.approvedLeave ? "LEAVE" : "PRESENT")]),
    ) as Record<string, AttendanceStatus>,
  );

  function save() {
    setMessage(null);
    start(async () => {
      const result = await saveStaffAttendance({
        date,
        marks: Object.entries(marks).map(([staffId, status]) => ({ staffId, status })),
      });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setMessage(`Saved ${result.saved} staff.`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="card overflow-hidden">
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-medium">{r.name}</p>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  {r.employeeId}
                  {r.designation ? ` · ${r.designation}` : ""}
                  {r.approvedLeave ? ` · approved ${r.approvedLeave.toLowerCase()} leave` : ""}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {OPTIONS.map((o) => {
                  const Icon = o.icon;
                  const active = marks[r.id] === o.value;
                  return (
                    <button
                      key={o.value}
                      onClick={() => setMarks((m) => ({ ...m, [r.id]: o.value }))}
                      className={`inline-flex items-center gap-1.5 rounded-md border-2 px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                        active ? o.tone : "border-line bg-white text-ink-3 hover:bg-paper-2"
                      }`}
                    >
                      <Icon className="size-3.5" /> {o.label}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="sticky bottom-0 z-20 mt-4 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <p className="text-[13.5px] text-ink-2">
          {Object.values(marks).filter((v) => v === "PRESENT" || v === "LATE").length} present ·{" "}
          {Object.values(marks).filter((v) => v === "ABSENT").length} absent ·{" "}
          {Object.values(marks).filter((v) => v === "LEAVE").length} on leave
        </p>
        {message ? <p className="text-[12.5px] text-good">{message}</p> : null}
        <Button className="ml-auto" size="lg" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save staff attendance
        </Button>
      </div>
    </>
  );
}
