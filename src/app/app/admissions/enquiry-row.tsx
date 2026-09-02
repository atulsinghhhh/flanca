"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import type { EnquiryStatus } from "@prisma/client";
import { Badge, Button } from "@/components/ui/primitives";
import { updateEnquiry } from "./actions";

const STATUSES: Array<{ value: EnquiryStatus; label: string }> = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "VISITED", label: "Visited" },
  { value: "CONVERTED", label: "Converted" },
  { value: "LOST", label: "Lost" },
];

export type EnquiryRowData = {
  id: string;
  studentName: string;
  classSought: string | null;
  parentName: string;
  phone: string;
  status: string;
  notes: string | null;
  source: string | null;
  createdAt: string;
};

const DATE = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function EnquiryRow({ row }: { row: EnquiryRowData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(row.status);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [message, setMessage] = useState<string | null>(null);

  function save() {
    setMessage(null);
    start(async () => {
      const r = await updateEnquiry({ id: row.id, status: status as EnquiryStatus, notes });
      if (r.error) {
        setMessage(r.error);
        return;
      }
      setMessage("Updated.");
      router.refresh();
    });
  }

  return (
    <li className="px-5 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            onClick={() => setOpen((o) => !o)}
            className="truncate text-left text-[13.5px] font-medium hover:text-brand"
          >
            {row.studentName}
          </button>
          <p className="text-[11.5px] text-ink-3">
            {row.classSought ?? "—"} · {row.parentName}
          </p>
        </div>
        <Badge tone={row.status === "CONVERTED" ? "good" : row.status === "LOST" ? "neutral" : "warn"}>
          {row.status.toLowerCase()}
        </Badge>
      </div>
      <p className="mt-1 flex items-center gap-2 text-[11.5px] text-ink-3">
        <a href={`tel:${row.phone}`} className="font-mono hover:text-brand">
          {row.phone}
        </a>
        · {row.source?.toLowerCase().replace("_", " ") ?? "—"} · {DATE(row.createdAt)}
      </p>

      {open ? (
        <div className="mt-2 space-y-2 rounded-md border border-line bg-paper-2/50 px-3 py-2.5">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="eyebrow text-ink-3 mb-1 block">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-8 rounded-md border border-line-2 bg-white px-2 text-[12.5px] outline-none focus:border-brand"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="eyebrow text-ink-3 mb-1 block">Follow-up note</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Called, will visit next week"
                className="h-8 w-full rounded-md border border-line-2 bg-white px-2 text-[12.5px] outline-none focus:border-brand"
              />
            </div>
            <Button size="sm" variant="secondary" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Save
            </Button>
          </div>
          {message ? <p className="text-[11.5px] text-good">{message}</p> : null}
        </div>
      ) : null}
    </li>
  );
}
