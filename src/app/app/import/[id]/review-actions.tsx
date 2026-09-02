"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Copy, Loader2, TriangleAlert, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { applyImport, discardImport, revertImport } from "../actions";

type Issued = { name: string; employeeId: string; firstPassword: string | null; reusedLogin: boolean };
type Failure = { rowNumber: number; message: string };
type Result = {
  ok?: boolean;
  error?: string;
  created?: number;
  updated?: number;
  removed?: number;
  kept?: number;
  issued?: Issued[];
  failures?: Failure[];
};

const COPY: Record<
  string,
  { noun: string; approve: (n: number) => string; undoTitle: string; undoBody: string; undoneNoun: string }
> = {
  STUDENTS: {
    noun: "students",
    approve: (n) => `Approve and import ${n} student${n === 1 ? "" : "s"}`,
    undoTitle: "Remove every student this import added?",
    undoBody: "Students who already have fees, attendance or marks are kept — we will tell you which.",
    undoneNoun: "students",
  },
  STAFF: {
    noun: "staff",
    approve: (n) => `Approve and add ${n} member${n === 1 ? "" : "s"} of staff`,
    undoTitle: "Remove every member of staff this import added?",
    undoBody: "Staff who already have attendance, pay, CPD hours, a timetable or a class are kept — we will tell you which.",
    undoneNoun: "staff",
  },
  FEE_STRUCTURE: {
    noun: "fee lines",
    approve: (n) => `Approve and set ${n} fee line${n === 1 ? "" : "s"}`,
    undoTitle: "Put these classes' fees back to what they were?",
    undoBody: "Each class and fee head this import priced goes back to its amount from before the import.",
    undoneNoun: "lines",
  },
};

export function ReviewActions({
  batchId,
  status,
  applicableRows,
  kind,
}: {
  batchId: string;
  status: string;
  applicableRows: number;
  kind: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const copy = COPY[kind] ?? COPY.STUDENTS;

  function run(fn: () => Promise<Result | undefined>) {
    start(async () => {
      const r = (await fn()) ?? {};
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  if (status === "VALIDATED") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="lg"
            disabled={pending || applicableRows === 0}
            onClick={() => run(() => applyImport(batchId))}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            {pending ? "Writing…" : copy.approve(applicableRows)}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={pending}
            onClick={() => run(() => discardImport(batchId))}
          >
            <X className="size-4" /> Cancel this import
          </Button>
        </div>
        <p className="text-[12.5px] text-ink-3">
          Rows with errors are skipped. You can undo the whole import afterwards.
        </p>
        {result?.error ? <Error message={result.error} /> : null}
      </div>
    );
  }

  if (status === "APPLIED") {
    return (
      <div className="space-y-3">
        {result?.ok && result.issued && result.issued.length > 0 ? (
          <IssuedLogins issued={result.issued} failures={result.failures} />
        ) : result?.ok && result.removed !== undefined ? (
          <p className="rounded-md border border-good/25 bg-good-light px-3 py-2 text-[13px] text-good">
            Undone. {result.removed} {copy.undoneNoun} removed
            {result.kept ? `, ${result.kept} kept — see the audit log for why` : ""}.
          </p>
        ) : confirmUndo ? (
          <div className="rounded-md border border-overdue/25 bg-overdue-light px-4 py-3">
            <p className="text-[13.5px] font-semibold text-overdue">{copy.undoTitle}</p>
            <p className="mt-1 text-[12.5px] text-overdue-ink">{copy.undoBody}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="danger" size="sm" disabled={pending} onClick={() => run(() => revertImport(batchId))}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                Yes, undo the import
              </Button>
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => setConfirmUndo(false)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmUndo(true)}>
            <Undo2 className="size-4" /> Undo this import
          </Button>
        )}
        {result?.error ? <Error message={result.error} /> : null}
      </div>
    );
  }

  return null;
}

/**
 * A staff import's first passwords, shown exactly once — the same rule
 * createStaff's own screen follows. Nothing here is persisted: it lives only
 * in this component's state, for as long as this tab stays open.
 */
function IssuedLogins({ issued, failures }: { issued: Issued[]; failures?: Failure[] }) {
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const fresh = issued.filter((i) => !i.reusedLogin && i.firstPassword);

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-md border border-brand/25 bg-brand-light/40 px-3 py-2.5 text-[13px] leading-relaxed text-brand-ink">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-marigold" />
        {fresh.length > 0
          ? "Write these down or read them out now. They are stored as hashes and cannot be shown again — use \"Reset password\" from a staff profile if one is lost."
          : "Everybody in this file already had a Flanca login, so nothing changed for them except being added here."}
      </p>
      {fresh.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="ruled w-full min-w-[420px]">
            <thead>
              <tr>
                <th>Employee id</th>
                <th>Name</th>
                <th>First password</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fresh.map((i) => (
                <tr key={i.employeeId}>
                  <td className="font-mono text-[12px]">{i.employeeId}</td>
                  <td>{i.name}</td>
                  <td className="font-mono text-[13px] font-semibold tabular-nums">{i.firstPassword}</td>
                  <td>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(i.firstPassword ?? "");
                        setCopiedFor(i.employeeId);
                      }}
                      className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline"
                    >
                      {copiedFor === i.employeeId ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copiedFor === i.employeeId ? "Copied" : "Copy"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {failures && failures.length > 0 ? (
        <div className="rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13px] text-overdue">
          {failures.length} row{failures.length === 1 ? "" : "s"} could not be written:
          <ul className="mt-1 list-disc pl-5">
            {failures.map((f) => (
              <li key={f.rowNumber}>
                Row {f.rowNumber}: {f.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Error({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13px] text-overdue">
      {message}
    </p>
  );
}
