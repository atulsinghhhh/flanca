import { AlertTriangle, Check, ShieldCheck, X } from "lucide-react";
import { formatMoney } from "@/lib/core/money";

/**
 * Live fragments of the real interface, not screenshots.
 *
 * They are built from the same tokens the product uses, so they stay honest as
 * the product changes and stay crisp at any size. A principal is being shown
 * the actual thing, at the actual size their staff will touch it.
 */

export function AttendanceFragment() {
  const roll = [
    { no: 12, name: "Aarav Sharma", status: "present" },
    { no: 13, name: "Diya Patel", status: "absent" },
    { no: 14, name: "Kabir Malviya", status: "present" },
  ] as const;

  return (
    <Frame label="Attendance · Class 6 A">
      <div className="border-b border-line px-3 py-2 text-[11.5px] text-ink-3">
        Everyone starts present — tap only the students who are absent.
      </div>
      <ul className="divide-y divide-line">
        {roll.map((s) => (
          <li key={s.no} className="flex items-center gap-2.5 px-3 py-2">
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 ${
                s.status === "present"
                  ? "border-good/30 bg-good-light text-good"
                  : "border-overdue/40 bg-overdue-light text-overdue"
              }`}
            >
              {s.status === "present" ? (
                <Check className="size-4" strokeWidth={3} />
              ) : (
                <X className="size-4" strokeWidth={3} />
              )}
            </span>
            <span className="tnum w-5 text-[11.5px] text-ink-3">{s.no}</span>
            <span className="text-[13px] font-medium">{s.name}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-line px-3 py-2">
        <span className="text-[11.5px] font-semibold text-good">2 present · 1 absent</span>
        <span className="rounded-md bg-brand px-2.5 py-1 text-[11px] font-semibold text-white">
          Save
        </span>
      </div>
    </Frame>
  );
}

export function InvoiceFragment() {
  const lines = [
    ["Tuition Fee", 855000],
    ["Development Fee", 90000],
    ["Examination Fee", 30000],
    ["Library", 15000],
    ["Computer Lab", 60000],
  ] as const;
  const total = lines.reduce((a, [, v]) => a + v, 0);

  return (
    <Frame label="What a parent sees">
      <div className="border-b border-line px-3 py-2">
        <p className="text-[12.5px] font-semibold">Term 1 (Apr–Jun)</p>
        <p className="text-[11px] text-ink-3">Invoice INV/26-27/00627 · due 15 Apr</p>
      </div>
      <div className="px-3 py-2">
        <p className="eyebrow text-ink-3 mb-1.5">What this is for</p>
        <ul>
          {lines.map(([head, amount]) => (
            <li key={head} className="flex justify-between py-[3px] text-[12px]">
              <span className="text-ink-2">{head}</span>
              <span className="tnum">{formatMoney(amount)}</span>
            </li>
          ))}
          <li className="mt-1 flex justify-between border-t border-line pt-1.5 text-[12.5px] font-semibold">
            <span>Total</span>
            <span className="tnum">{formatMoney(total)}</span>
          </li>
        </ul>
      </div>
      <p className="flex items-start gap-1.5 border-t border-line bg-good-light/70 px-3 py-2 text-[11px] leading-snug text-good">
        <ShieldCheck className="mt-px size-3 shrink-0" />
        You pay exactly {formatMoney(total)} — no convenience fee, no hidden charges.
      </p>
    </Frame>
  );
}

export function ApaarFragment() {
  return (
    <Frame label="APAAR & UDISE+">
      <div className="flex items-start gap-2 bg-overdue-light px-3 py-2.5">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-overdue" />
        <p className="text-[11.5px] leading-snug text-[#7d1c16]">
          <strong className="font-semibold">149 students cannot be certified</strong> — UDISE+
          freezes in 42 days.
        </p>
      </div>
      <ul className="divide-y divide-line">
        <li className="px-3 py-2">
          <p className="text-[12.5px] font-medium">Vihaan Gupta</p>
          <p className="mt-0.5 text-[11px] text-[#8a5a10]">
            Aadhaar has extra name part: Prasad — Aadhaar: &ldquo;Vihaan Prasad Gupta&rdquo;
          </p>
          <p className="mt-1 text-[11px] font-semibold text-brand">Use Aadhaar name →</p>
        </li>
        <li className="px-3 py-2">
          <p className="text-[12.5px] font-medium">Ira Mishra</p>
          <p className="mt-0.5 text-[11px] text-ink-3">Collect verifiable parental consent</p>
        </li>
      </ul>
    </Frame>
  );
}

export function ImportFragment() {
  const rows = [
    { row: 4, name: "Kabir Malviya", note: "Mobile “98765” is not 10 digits", level: "warn" },
    { row: 5, name: "—", note: "Student Name is required", level: "error" },
    { row: 9, name: "Disha Mishra", note: "Already on the roll — this row will UPDATE", level: "warn" },
  ] as const;

  return (
    <Frame label="Your Excel, checked before anything is saved">
      <div className="grid grid-cols-3 border-b border-line">
        {[
          ["8", "rows"],
          ["3", "ready"],
          ["2", "errors"],
        ].map(([n, l]) => (
          <div key={l} className="px-3 py-2 text-center">
            <p className="tnum text-[15px] font-semibold">{n}</p>
            <p className="text-[10px] text-ink-3">{l}</p>
          </div>
        ))}
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li
            key={r.row}
            className={`px-3 py-2 ${r.level === "error" ? "bg-overdue-light/45" : "bg-marigold-light/40"}`}
          >
            <p className="text-[12px] font-medium">
              <span className="tnum mr-1.5 text-ink-3">{r.row}</span>
              {r.name}
            </p>
            <p
              className={`mt-0.5 text-[11px] ${r.level === "error" ? "text-[#7d1c16]" : "text-[#6d4409]"}`}
            >
              {r.note}
            </p>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-white shadow-[0_1px_2px_rgba(22,25,29,0.05)]">
      <figcaption className="border-b border-line bg-paper-2/70 px-3 py-1.5 text-[10.5px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
        {label}
      </figcaption>
      {children}
    </figure>
  );
}
