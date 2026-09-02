"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { StudentStatus } from "@prisma/client";
import { setStudentStatus } from "../actions";

const OPTIONS: Array<{ value: "ACTIVE" | "ALUMNI" | "DROPPED"; label: string }> = [
  { value: "ACTIVE", label: "On roll" },
  { value: "ALUMNI", label: "Alumni" },
  { value: "DROPPED", label: "Left / dropped" },
];

/**
 * Correcting a mistake or closing out a child who left without a TC — the
 * only two lifecycle moves besides a transfer, which already has its own
 * certificate-driven path and is left alone here.
 */
export function StatusControl({ studentId, status }: { studentId: string; status: StudentStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "TRANSFERRED") return null;

  function change(next: "ACTIVE" | "ALUMNI" | "DROPPED") {
    setError(null);
    start(async () => {
      const r = await setStudentStatus(studentId, next);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <span className="relative inline-flex items-center gap-2">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-3 hover:text-brand"
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : null}
        Change status
      </button>
      {open ? (
        <span className="absolute top-full left-0 z-10 mt-1 flex flex-col rounded-md border border-line bg-white py-1 shadow-md">
          {OPTIONS.filter((o) => o.value !== status).map((o) => (
            <button
              key={o.value}
              onClick={() => change(o.value)}
              disabled={pending}
              className="px-3 py-1.5 text-left text-[13px] whitespace-nowrap hover:bg-paper-2"
            >
              Mark as {o.label}
            </button>
          ))}
        </span>
      ) : null}
      {error ? <span className="text-[11.5px] text-overdue">{error}</span> : null}
    </span>
  );
}
