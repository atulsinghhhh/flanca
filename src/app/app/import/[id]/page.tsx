import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleAlert, Undo2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, MONEY } from "@/lib/session";
import { FEE_STRUCTURE_FIELDS, STAFF_FIELDS, STUDENT_FIELDS, type FieldSpec } from "@/lib/core/import-core";
import { formatMoney } from "@/lib/core/money";
import { Badge, Card, CardHead, PageHead, Stat } from "@/components/ui/primitives";
import { ReviewActions } from "./review-actions";

export const metadata = { title: "Review import — Flanca" };

const SHOW_LIMIT = 250;

type RowMessage = { field: string; level: "ERROR" | "WARNING"; message: string };
type Row = Record<string, unknown>;
type Col = { label: string; render: (p: Row) => string };

const FIELDS_BY_KIND: Record<string, FieldSpec[]> = {
  STUDENTS: STUDENT_FIELDS,
  STAFF: STAFF_FIELDS,
  FEE_STRUCTURE: FEE_STRUCTURE_FIELDS,
};

const classCell = (p: Row) => `${String(p.className ?? "—")}${p.sectionName ? ` ${String(p.sectionName)}` : ""}`;
const rolesCell = (p: Row) => (Array.isArray(p.roles) ? (p.roles as string[]).join(", ") : "—");
const amountCell = (p: Row) => (typeof p.amount === "number" ? formatMoney(p.amount) : "—");

const PROBLEM_COLUMNS: Record<string, Col[]> = {
  STUDENTS: [
    { label: "Admission no", render: (p) => String(p.admissionNumber ?? "—") },
    { label: "Name", render: (p) => String(p.name ?? "—") },
    { label: "Class", render: classCell },
  ],
  STAFF: [
    { label: "Name", render: (p) => String(p.name ?? "—") },
    { label: "Email", render: (p) => String(p.email ?? "—") },
    { label: "Roles", render: rolesCell },
  ],
  FEE_STRUCTURE: [
    { label: "Class", render: (p) => String(p.className ?? "—") },
    { label: "Fee Head", render: (p) => String(p.feeHeadName ?? "—") },
    { label: "Amount", render: amountCell },
  ],
};

const CLEAN_COLUMNS: Record<string, Col[]> = {
  STUDENTS: [
    { label: "Admission no", render: (p) => String(p.admissionNumber ?? "—") },
    { label: "Name", render: (p) => String(p.name ?? "—") },
    { label: "Class", render: classCell },
    { label: "Roll", render: (p) => (p.rollNumber != null ? String(p.rollNumber) : "—") },
    { label: "Father", render: (p) => String(p.fatherName ?? "—") },
    { label: "Mobile", render: (p) => String(p.guardianPhone ?? "—") },
    {
      label: "DOB",
      render: (p) =>
        p.dob ? new Date(String(p.dob)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—",
    },
  ],
  STAFF: [
    { label: "Name", render: (p) => String(p.name ?? "—") },
    { label: "Email", render: (p) => String(p.email ?? "—") },
    { label: "Roles", render: rolesCell },
    { label: "Designation", render: (p) => String(p.designation ?? "—") },
    { label: "Mobile", render: (p) => String(p.phone ?? "—") },
  ],
  FEE_STRUCTURE: [
    { label: "Class", render: (p) => String(p.className ?? "—") },
    { label: "Fee Head", render: (p) => String(p.feeHeadName ?? "—") },
    { label: "Amount", render: amountCell },
  ],
};

export default async function ReviewImportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole(...MONEY);
  const { id } = await params;

  const batch = await db.importBatch.findFirst({
    where: { id, schoolId: actor.schoolId },
    include: { user: { select: { name: true } } },
  });
  if (!batch) notFound();

  // Problems first: a principal wants to see what is wrong, not scroll past 800 clean rows.
  const [problemRows, cleanRows] = await Promise.all([
    db.importRow.findMany({
      where: { batchId: batch.id, state: { in: ["ERROR", "WARNING"] } },
      orderBy: { rowNumber: "asc" },
      take: SHOW_LIMIT,
    }),
    db.importRow.findMany({
      where: { batchId: batch.id, state: "OK" },
      orderBy: { rowNumber: "asc" },
      take: SHOW_LIMIT,
    }),
  ]);

  const fields = FIELDS_BY_KIND[batch.kind] ?? STUDENT_FIELDS;
  const columnMap = (batch.columnMap ?? {}) as Record<string, string | null>;
  const mapped = fields.filter((f) => columnMap[f.field]);
  const unmapped = fields.filter((f) => !columnMap[f.field]);
  const applicable = batch.okRows + batch.warningRows;
  const problemColumns = PROBLEM_COLUMNS[batch.kind] ?? PROBLEM_COLUMNS.STUDENTS;
  const cleanColumns = CLEAN_COLUMNS[batch.kind] ?? CLEAN_COLUMNS.STUDENTS;

  const statusLabel =
    batch.status === "VALIDATED"
      ? "Checked — awaiting your approval"
      : batch.status === "APPLIED"
        ? "Imported"
        : batch.status === "REVERTED"
          ? "Undone"
          : "Cancelled";

  return (
    <>
      <Link
        href="/app/import"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> All imports
      </Link>

      <PageHead
        eyebrow={`${batch.fileName}${batch.note ? ` · ${batch.note}` : ""}`}
        title={statusLabel}
        sub={
          batch.status === "VALIDATED"
            ? "Nothing has been written to your school yet. Look through the rows below, then approve."
            : batch.status === "APPLIED"
              ? `Applied ${batch.appliedRows} rows on ${batch.appliedAt?.toLocaleString("en-IN")}. You can still undo this.`
              : batch.status === "REVERTED"
                ? `Undone on ${batch.revertedAt?.toLocaleString("en-IN")}.`
                : "This import was cancelled before anything was written."
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Rows in file" value={batch.totalRows} sub={`uploaded by ${batch.user?.name ?? "—"}`} />
        <Stat label="Ready" value={batch.okRows} tone="good" sub="no problems found" />
        <Stat
          label="With warnings"
          value={batch.warningRows}
          tone={batch.warningRows > 0 ? "warn" : "neutral"}
          sub="will import, but check them"
        />
        <Stat
          label="Errors"
          value={batch.errorRows}
          tone={batch.errorRows > 0 ? "bad" : "good"}
          sub={batch.errorRows > 0 ? "these rows will be skipped" : "nothing blocked"}
        />
      </div>

      {batch.status === "VALIDATED" || batch.status === "APPLIED" ? (
        <Card className="mt-5 px-5 py-4">
          <ReviewActions batchId={batch.id} status={batch.status} applicableRows={applicable} kind={batch.kind} />
        </Card>
      ) : null}

      {/* ── column mapping: show the clerk exactly what we understood ── */}
      <Card className="mt-5">
        <CardHead
          title="Columns we matched"
          hint="Detected from your headers. Anything unmatched is simply left blank — no data is invented."
        />
        <div className="grid gap-x-8 gap-y-1.5 px-5 py-4 sm:grid-cols-2">
          {mapped.map((f) => (
            <div key={f.field} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="truncate font-mono text-[12px] text-ink-2">{columnMap[f.field]}</span>
              <span className="shrink-0 text-ink-3">→</span>
              <span className="truncate text-right font-medium">{f.label}</span>
            </div>
          ))}
        </div>
        {unmapped.length > 0 ? (
          <div className="border-t border-line px-5 py-3">
            <p className="eyebrow text-ink-3 mb-1.5">Not found in your file</p>
            <p className="text-[12.5px] text-ink-3">
              {unmapped.map((f) => f.label).join(" · ")} — these stay empty and can be filled later.
            </p>
          </div>
        ) : null}
      </Card>

      {/* ── the rows ── */}
      {problemRows.length > 0 ? (
        <Card className="mt-5">
          <CardHead
            title={`Rows needing a look (${batch.errorRows + batch.warningRows})`}
            hint="Errors are skipped on import. Warnings are imported as shown."
          />
          <div className="overflow-x-auto">
            <table className="ruled w-full min-w-[820px]">
              <thead>
                <tr>
                  <th className="w-14">Row</th>
                  {problemColumns.map((c) => (
                    <th key={c.label}>{c.label}</th>
                  ))}
                  <th>What we found</th>
                </tr>
              </thead>
              <tbody>
                {problemRows.map((row) => {
                  const p = (row.parsed ?? {}) as Record<string, unknown>;
                  const messages = (row.messages ?? []) as RowMessage[];
                  const isError = row.state === "ERROR";
                  return (
                    <tr key={row.id} className={isError ? "bg-overdue-light/45" : "bg-marigold-light/40"}>
                      <td data-label="Row" className="num text-ink-3">{row.rowNumber}</td>
                      {problemColumns.map((c, i) => (
                        <td key={c.label} data-title={i === 0 ? true : undefined} data-label={c.label} className={i === 0 ? "font-medium" : "text-ink-2"}>
                          {c.render(p)}
                        </td>
                      ))}
                      <td data-label="What we found">
                        <ul className="space-y-0.5">
                          {messages.map((m, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[12.5px]">
                              {m.level === "ERROR" ? (
                                <CircleAlert className="mt-[2px] size-3.5 shrink-0 text-overdue" />
                              ) : (
                                <AlertTriangle className="mt-[2px] size-3.5 shrink-0 text-marigold-ink" />
                              )}
                              <span className={m.level === "ERROR" ? "text-overdue-ink" : "text-marigold-ink-strong"}>
                                {m.message}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {batch.errorRows + batch.warningRows > SHOW_LIMIT ? (
            <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-ink-3">
              Showing the first {SHOW_LIMIT} of {batch.errorRows + batch.warningRows} rows needing a look.
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card className="mt-5">
        <CardHead
          title={batch.status === "APPLIED" ? "Imported rows" : "Rows ready to import"}
          hint={`${batch.okRows} clean row${batch.okRows === 1 ? "" : "s"} — this is exactly what will be written.`}
          action={
            batch.status === "APPLIED" ? (
              <Badge tone="good">
                <CheckCircle2 className="size-3" /> Written
              </Badge>
            ) : null
          }
        />
        {cleanRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-3">No clean rows in this file.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ruled w-full min-w-[880px]">
              <thead>
                <tr>
                  <th className="w-14">Row</th>
                  {cleanColumns.map((c) => (
                    <th key={c.label}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cleanRows.map((row) => {
                  const p = (row.parsed ?? {}) as Record<string, unknown>;
                  return (
                    <tr key={row.id}>
                      <td data-label="Row" className="num text-ink-3">{row.rowNumber}</td>
                      {cleanColumns.map((c, i) => (
                        <td key={c.label} data-title={i === 0 ? true : undefined} data-label={c.label} className={i === 0 ? "font-medium" : "text-ink-2"}>
                          {c.render(p)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {batch.okRows > SHOW_LIMIT ? (
          <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-ink-3">
            Showing the first {SHOW_LIMIT} of {batch.okRows} clean rows. All of them will be imported.
          </p>
        ) : null}
      </Card>
    </>
  );
}
