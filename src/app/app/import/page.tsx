import Link from "next/link";
import { CheckCircle2, Download, Eye, RotateCcw, ShieldCheck, Undo2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, MONEY } from "@/lib/session";
import { Badge, Card, CardHead, Empty, PageHead, type Tone } from "@/components/ui/primitives";
import { UploadForm } from "./upload-form";
import { uploadFeeStructureFile, uploadStaffFile, uploadStudentFile } from "./actions";

export const metadata = { title: "Import data — Flanca" };

const STATUS_TONE: Record<string, Tone> = {
  UPLOADED: "neutral",
  VALIDATED: "info",
  APPLIED: "good",
  REVERTED: "warn",
  DISCARDED: "neutral",
};

const KIND_LABEL: Record<string, string> = {
  STUDENTS: "Students",
  STAFF: "Staff",
  FEE_STRUCTURE: "Fee structure",
};

const KINDS = [
  {
    kind: "STUDENTS",
    tab: "Students",
    cardTitle: "Import students",
    hint: "Column names are detected automatically — you do not have to reformat anything.",
    fileLabel: "Choose your Excel or CSV file",
    action: uploadStudentFile,
  },
  {
    kind: "STAFF",
    tab: "Staff",
    cardTitle: "Import staff",
    hint: "Each row becomes a member of staff with a login, exactly as if you had added them one by one from Staff → Add.",
    fileLabel: "Choose your staff list",
    action: uploadStaffFile,
  },
  {
    kind: "FEE_STRUCTURE",
    tab: "Fee structure",
    cardTitle: "Import fee structure",
    hint: "One row per class and fee head. The class and the fee head must already exist — this sets what each one charges.",
    fileLabel: "Choose your fee-structure sheet",
    action: uploadFeeStructureFile,
  },
] as const;

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const actor = await requireRole(...MONEY);
  const { kind: kindParam } = await searchParams;
  const active = KINDS.find((k) => k.kind === kindParam) ?? KINDS[0];

  const batches = await db.importBatch.findMany({
    where: { schoolId: actor.schoolId },
    orderBy: { uploadedAt: "desc" },
    take: 12,
    include: { user: { select: { name: true } } },
  });

  return (
    <>
      <PageHead
        eyebrow="Setup"
        title="Bring your existing records in"
        sub="Give us the register you already keep — an Excel sheet, a CSV export from your old software, anything. We read it, show you every row, and write nothing until you approve."
      />

      <div className="flex gap-1.5 border-b border-line">
        {KINDS.map((k) => (
          <Link
            key={k.kind}
            href={`/app/import?kind=${k.kind}`}
            className={`rounded-t-md px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
              k.kind === active.kind
                ? "border border-b-0 border-line bg-white text-ink"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            {k.tab}
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="rounded-t-none">
          <CardHead title={active.cardTitle} hint={active.hint} />
          <div className="px-5 py-5">
            <UploadForm action={active.action} label={active.fileLabel} />
          </div>
        </Card>

        <div className="space-y-5">
          {/* the promise, stated where it matters */}
          <Card>
            <CardHead title="How this works" />
            <ol className="divide-y divide-line">
              {[
                {
                  step: "1",
                  title: "We read your file",
                  body: "Headers are matched to Flanca fields — 'Adm.No', 'Std', 'Sec', 'DOB (DD/MM/YYYY)' and the rest are all recognised.",
                },
                {
                  step: "2",
                  title: "You see every row first",
                  body: "Each row is checked and shown with its problems. Nothing has been written to your school yet.",
                },
                {
                  step: "3",
                  title: "You approve",
                  body: "Only the rows you approve are written, in one transaction. Missing classes and sections are created for you.",
                },
                {
                  step: "4",
                  title: "You can undo",
                  body: "One click removes everything the import added. Students who already have fees or marks are kept and named.",
                },
              ].map((s) => (
                <li key={s.step} className="flex gap-3 px-5 py-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-light text-[11px] font-bold text-brand-ink">
                    {s.step}
                  </span>
                  <div>
                    <p className="text-[13.5px] font-semibold">{s.title}</p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex items-start gap-2.5 border-t border-line bg-brand-light/40 px-5 py-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
              <p className="text-[12.5px] leading-snug text-brand-ink">
                Your data stays yours. Export the whole school to Excel at any time, free, from
                Settings — no lock-in, no exit fee.
              </p>
            </div>
          </Card>

          <Card>
            <CardHead title="Starting from paper?" />
            <div className="px-5 py-4">
              <p className="text-[13px] leading-snug text-ink-2">
                Download the blank sheet, fill it in, and upload it back. It has one filled example
                row showing the formats we expect.
              </p>
              <a
                href={`/app/import/template?kind=${active.kind}`}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 py-2 text-[13px] font-semibold hover:bg-paper-2"
              >
                <Download className="size-4" /> Download blank template
              </a>
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <CardHead title="Import history" hint="Every import is kept, with who ran it and whether it was undone." />
        {batches.length === 0 ? (
          <Empty title="No imports yet" hint="Your first import will appear here with a full record of what changed." />
        ) : (
          <div className="overflow-x-auto">
            <table className="ruled w-full min-w-[720px]">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Kind</th>
                  <th>Uploaded</th>
                  <th>By</th>
                  <th className="num">Rows</th>
                  <th className="num">Applied</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td data-title className="max-w-[220px] truncate font-medium">{b.fileName}</td>
                    <td data-label="Kind" className="text-ink-2">{KIND_LABEL[b.kind] ?? b.kind}</td>
                    <td data-label="Uploaded" className="whitespace-nowrap text-ink-2">
                      {b.uploadedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}{" "}
                      {b.uploadedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td data-label="By" className="text-ink-2">{b.user?.name ?? "—"}</td>
                    <td data-label="Rows" className="num">{b.totalRows}</td>
                    <td data-label="Applied" className="num">{b.appliedRows || "—"}</td>
                    <td data-label="Status">
                      <Badge tone={STATUS_TONE[b.status] ?? "neutral"}>
                        {b.status === "VALIDATED"
                          ? "Awaiting approval"
                          : b.status === "APPLIED"
                            ? "Applied"
                            : b.status === "REVERTED"
                              ? "Undone"
                              : b.status === "DISCARDED"
                                ? "Cancelled"
                                : b.status}
                      </Badge>
                    </td>
                    <td data-label="">
                      <Link
                        href={`/app/import/${b.id}`}
                        className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
                      >
                        {b.status === "VALIDATED" ? (
                          <>
                            <Eye className="size-3.5" /> Review
                          </>
                        ) : b.status === "APPLIED" ? (
                          <>
                            <CheckCircle2 className="size-3.5" /> View
                          </>
                        ) : (
                          <>
                            <RotateCcw className="size-3.5" /> View
                          </>
                        )}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
