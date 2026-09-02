import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { Badge, Card, CardHead, Empty, PageHead } from "@/components/ui/primitives";

export const metadata = { title: "Audit trail — Flanca" };

const AREA: Record<string, { label: string; tone: "brand" | "good" | "warn" | "bad" | "info" | "neutral" }> = {
  fee: { label: "Money", tone: "good" },
  attendance: { label: "Attendance", tone: "info" },
  exam: { label: "Exams", tone: "brand" },
  report: { label: "Report cards", tone: "brand" },
  apaar: { label: "APAAR", tone: "warn" },
  consent: { label: "Consent", tone: "warn" },
  certificate: { label: "Certificates", tone: "neutral" },
  import: { label: "Import", tone: "info" },
  admission: { label: "Admissions", tone: "brand" },
  student: { label: "Students", tone: "brand" },
  school: { label: "School", tone: "neutral" },
  library: { label: "Library", tone: "neutral" },
  payroll: { label: "Payroll", tone: "good" },
  chat: { label: "Chat", tone: "info" },
  circular: { label: "Notices", tone: "info" },
  calendar: { label: "Calendar", tone: "info" },
  gate: { label: "Gate", tone: "neutral" },
  udise: { label: "UDISE", tone: "warn" },
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; page?: string }>;
}) {
  const actor = await requireRole(...OFFICE);
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const perPage = 60;

  const where = {
    schoolId: actor.schoolId,
    ...(sp.area ? { action: { startsWith: `${sp.area}.` } } : {}),
  };

  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { actor: { select: { name: true } } },
    }),
    db.auditLog.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <>
      <Link
        href="/app/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Settings
      </Link>

      <PageHead
        eyebrow="Setup"
        title="Audit trail"
        sub="Who did what, and when. Nothing here can be edited or deleted — that is the point of keeping it."
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href="/app/settings/audit"
          className={
            !sp.area
              ? "rounded-full bg-brand-light px-3 py-1 text-[13px] font-semibold text-brand-ink"
              : "rounded-full px-3 py-1 text-[13px] font-medium text-ink-3 hover:bg-paper-2 hover:text-ink"
          }
        >
          Everything
        </Link>
        {Object.entries(AREA).map(([key, meta]) => (
          <Link
            key={key}
            href={`/app/settings/audit?area=${key}`}
            className={
              sp.area === key
                ? "rounded-full bg-brand-light px-3 py-1 text-[13px] font-semibold text-brand-ink"
                : "rounded-full px-3 py-1 text-[13px] font-medium text-ink-3 hover:bg-paper-2 hover:text-ink"
            }
          >
            {meta.label}
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHead
          title={`${total.toLocaleString("en-IN")} actions`}
          hint="Newest first"
          action={<History className="size-4 text-ink-3" />}
        />

        {entries.length === 0 ? (
          <Empty title="Nothing logged in this area yet" />
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((e) => {
              const area = AREA[e.action.split(".")[0]];
              return (
                <li key={e.id} className="flex flex-wrap items-start gap-3 px-5 py-2.5">
                  <div className="w-[132px] shrink-0">
                    <p className="tnum text-[12px] text-ink-2">
                      {e.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}{" "}
                      {e.createdAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                    </p>
                    <p className="truncate text-[11.5px] text-ink-3">{e.actor?.name ?? "System"}</p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] leading-snug">{e.summary}</p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">{e.action}</p>
                  </div>

                  <div className="shrink-0">
                    {area ? <Badge tone={area.tone}>{area.label}</Badge> : null}
                    {e.reversible ? (
                      <p className="mt-1 text-[10.5px] text-ink-3">reversible</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {pageCount > 1 ? (
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <p className="text-[12.5px] text-ink-3">
              Page {page} of {pageCount}
            </p>
            <div className="flex gap-1.5">
              {page > 1 ? (
                <Link
                  href={`/app/settings/audit?${sp.area ? `area=${sp.area}&` : ""}page=${page - 1}`}
                  className="rounded-md border border-line-2 bg-white px-3 py-1.5 text-[13px] font-semibold hover:bg-paper-2"
                >
                  Previous
                </Link>
              ) : null}
              {page < pageCount ? (
                <Link
                  href={`/app/settings/audit?${sp.area ? `area=${sp.area}&` : ""}page=${page + 1}`}
                  className="rounded-md border border-line-2 bg-white px-3 py-1.5 text-[13px] font-semibold hover:bg-paper-2"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>
    </>
  );
}
