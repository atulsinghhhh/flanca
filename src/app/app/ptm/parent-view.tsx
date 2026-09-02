"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Badge, Button, Card, CardHead, Empty } from "@/components/ui/primitives";
import { minutesToClock } from "@/lib/core/ptm-core";
import { bookSlot, cancelBooking } from "./actions";

export type PtmChildSlot = {
  id: string;
  dateIso: string;
  startMinute: number;
  endMinute: number;
  teacherName: string;
  booked: boolean;
  bookedForThisChild: boolean;
  bookedStudentName: string | null;
  note: string | null;
};

export type PtmChild = {
  studentId: string;
  name: string;
  sectionId: string;
  sectionLabel: string;
  classTeacherName: string | null;
  slots: PtmChildSlot[];
};

const DATE_LABEL = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function ParentPtmView({ children }: { children: PtmChild[] }) {
  return (
    <div className="mt-5 space-y-5">
      {children.map((child) => (
        <ChildCard key={child.studentId} child={child} />
      ))}
    </div>
  );
}

function ChildCard({ child }: { child: PtmChild }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string } | undefined>) {
    setError(null);
    start(async () => {
      const r = (await fn()) ?? {};
      if (r.error) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHead
        title={child.name}
        hint={`${child.sectionLabel}${child.classTeacherName ? ` · class teacher ${child.classTeacherName}` : ""}`}
      />
      {error ? (
        <p className="mx-5 mt-3 rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13px] text-overdue">
          {error}
        </p>
      ) : null}

      {child.slots.length === 0 ? (
        <Empty title="No slots open yet." hint="The class teacher has not opened any meeting slots." />
      ) : (
        <ul className="divide-y divide-line">
          {child.slots.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
              <span className="text-[13px] font-medium text-ink-3">{DATE_LABEL(s.dateIso)}</span>
              <span className="text-[13px] font-medium tnum">
                {minutesToClock(s.startMinute)}–{minutesToClock(s.endMinute)}
              </span>
              <span className="text-[12px] text-ink-3">with {s.teacherName}</span>
              {s.note ? <span className="w-full text-[11.5px] text-ink-3">{s.note}</span> : null}

              <span className="ml-auto">
                {s.bookedForThisChild ? (
                  <span className="flex items-center gap-2">
                    <Badge tone="good">Your booking</Badge>
                    <button
                      onClick={() => run(() => cancelBooking({ slotId: s.id }))}
                      disabled={pending}
                      className="text-[12px] font-semibold text-overdue hover:text-overdue/80"
                    >
                      Cancel
                    </button>
                  </span>
                ) : s.booked ? (
                  <Badge tone="neutral">Taken</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => run(() => bookSlot({ slotId: s.id, studentId: child.studentId }))}
                  >
                    {pending ? <Loader2 className="size-3.5 animate-spin" /> : null} Book
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
