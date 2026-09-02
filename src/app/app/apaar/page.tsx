import Link from "next/link";
import { AlertTriangle, BadgeCheck, CalendarClock, Download, ShieldCheck } from "lucide-react";
import { requireRole, OFFICE } from "@/lib/session";
import { db } from "@/lib/db";
import { getApaarCentre } from "@/lib/queries/compliance";
import { getClassOptions } from "@/lib/queries/students";
import { formatPercent } from "@/lib/core/grading-core";
import { APAAR_STATES } from "@/lib/core/apaar-core";
import { Badge, Card, CardHead, Empty, Meter, PageHead, Stat } from "@/components/ui/primitives";
import { ApaarWorklist, BulkPaste } from "./apaar-worklist";

export const metadata = { title: "APAAR & UDISE — Flanca" };

const STATE_LABEL: Record<string, string> = {
  ISSUED: "ID issued",
  SUBMITTED: "Awaiting UDISE+",
  MISMATCH: "Aadhaar name mismatch",
  CONSENT_PENDING: "Consent not collected",
  CONSENT_REFUSED: "Parent refused",
  NOT_STARTED: "Not started",
};

export default async function ApaarPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; classId?: string; q?: string }>;
}) {
  const actor = await requireRole(...OFFICE);
  const sp = await searchParams;

  const state = APAAR_STATES.includes(sp.state as never) ? (sp.state as never) : undefined;
  const [centre, classes, exports] = await Promise.all([
    getApaarCentre(actor.schoolId, { state, classId: sp.classId, q: sp.q?.trim() || undefined }),
    getClassOptions(actor.schoolId),
    db.udiseExport.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { generatedAt: "desc" },
      take: 8,
    }),
  ]);

  const worklist = (state ? centre.rows : centre.blocking).map((r) => ({
    id: r.id,
    name: r.name,
    admissionNumber: r.admissionNumber,
    className: r.className,
    sectionName: r.sectionName,
    guardianPhone: r.guardianPhone,
    apaarId: r.apaarId,
    penNumber: r.penNumber,
    aadhaarName: r.aadhaarName,
    apaarNote: r.apaarNote,
    state: r.state,
    nextAction: r.nextAction,
    nameMatches: r.nameCheck.matches,
    nameReason: r.nameCheck.reason,
  }));

  return (
    <>
      <PageHead
        eyebrow="Compliance"
        title="APAAR & UDISE+"
        sub="An APAAR ID is mandatory for every student in 2026-27, and a student without one blocks the school's entire UDISE+ certification. This is the worklist, not a report."
        actions={
          <Link
            href="/app/apaar/export"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold hover:bg-paper-2"
          >
            <Download className="size-4" /> UDISE+ export
          </Link>
        }
      />

      {/* ── the deadline, stated once, prominently ── */}
      <div
        className={`mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3 ${
          centre.coverage.canCertify
            ? "border-good/25 bg-good-light"
            : centre.daysToFreeze <= 45
              ? "border-overdue/30 bg-overdue-light"
              : "border-marigold/35 bg-marigold-light"
        }`}
      >
        <CalendarClock
          className={`size-5 shrink-0 ${
            centre.coverage.canCertify ? "text-good" : centre.daysToFreeze <= 45 ? "text-overdue" : "text-marigold-ink"
          }`}
        />
        <p
          className={`min-w-0 flex-1 text-[13.5px] leading-snug ${
            centre.coverage.canCertify ? "text-good" : centre.daysToFreeze <= 45 ? "text-overdue-ink" : "text-marigold-ink-strong"
          }`}
        >
          {centre.coverage.canCertify ? (
            <>
              <strong className="font-semibold">Every student has an APAAR ID.</strong> This school can
              certify on UDISE+ — nothing is blocking you.
            </>
          ) : (
            <>
              <strong className="font-semibold">
                {centre.coverage.blocking} student{centre.coverage.blocking === 1 ? "" : "s"} cannot be
                certified
              </strong>{" "}
              — UDISE+ freezes in {centre.daysToFreeze} days, on 30 September 2026. Student progression,
              new admissions and APAAR IDs all lock on that date.
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="APAAR coverage"
          value={formatPercent(centre.coverage.coverageBp, 1)}
          tone={centre.coverage.canCertify ? "good" : "warn"}
          sub={`${centre.coverage.issued} of ${centre.coverage.total} students`}
          icon={<BadgeCheck className="size-4" />}
        />
        <Stat
          label="Blocking certification"
          value={centre.coverage.blocking}
          tone={centre.coverage.blocking > 0 ? "bad" : "good"}
          sub="need an ID before 30 Sept"
        />
        <Stat
          label="Name mismatches"
          value={centre.mismatches.length}
          tone={centre.mismatches.length > 0 ? "warn" : "good"}
          sub="will be rejected by the portal"
          icon={<AlertTriangle className="size-4" />}
        />
        <Stat
          label="Days to freeze"
          value={centre.daysToFreeze > 0 ? centre.daysToFreeze : "passed"}
          tone={centre.daysToFreeze <= 45 ? "bad" : "warn"}
          sub="30 September 2026"
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <CardHead
            title={state ? `${STATE_LABEL[state] ?? state}` : "Students still blocking certification"}
            hint="Each row says exactly what the office should do next."
            action={<BulkPaste />}
          />

          <form method="get" className="flex flex-wrap items-end gap-2.5 border-b border-line px-5 py-3">
            <div className="min-w-[180px] flex-1">
              <label htmlFor="q" className="eyebrow text-ink-3 mb-1 block">
                Search
              </label>
              <input
                id="q"
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Name, admission no or APAAR ID"
                className="h-9 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
              />
            </div>
            <div>
              <label htmlFor="classId" className="eyebrow text-ink-3 mb-1 block">
                Class
              </label>
              <select
                id="classId"
                name="classId"
                defaultValue={sp.classId ?? ""}
                className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="state" className="eyebrow text-ink-3 mb-1 block">
                Status
              </label>
              <select
                id="state"
                name="state"
                defaultValue={sp.state ?? ""}
                className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
              >
                <option value="">All blocking</option>
                {APAAR_STATES.map((s) => (
                  <option key={s} value={s}>
                    {STATE_LABEL[s] ?? s}
                  </option>
                ))}
              </select>
            </div>
            <button className="h-9 rounded-md bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-dark">
              Apply
            </button>
            {sp.q || sp.classId || sp.state ? (
              <Link href="/app/apaar" className="h-9 px-2 pt-2 text-[13px] font-semibold text-ink-3 hover:text-ink">
                Clear
              </Link>
            ) : null}
          </form>

          {worklist.length === 0 ? (
            <Empty
              title="Nothing pending here"
              hint="Every student in this filter already has an APAAR ID."
            />
          ) : (
            <ApaarWorklist rows={worklist} />
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHead title="By status" />
            <ul className="divide-y divide-line">
              {APAAR_STATES.map((s) => {
                const count = centre.coverage.byState[s];
                if (count === 0) return null;
                return (
                  <li key={s} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <Link
                      href={`/app/apaar?state=${s}`}
                      className="text-[13.5px] hover:text-brand hover:underline"
                    >
                      {STATE_LABEL[s] ?? s}
                    </Link>
                    <span className="tnum text-[13.5px] font-semibold">{count}</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHead title="By class" hint="Chase it class teacher by class teacher" />
            <ul className="divide-y divide-line">
              {centre.classSummary.map((c) => (
                <li key={c.className} className="px-5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13.5px] font-medium">{c.className}</span>
                    <span className="tnum text-[12.5px]">
                      {c.issued}/{c.total}
                    </span>
                  </div>
                  <Meter
                    valueBp={c.coverageBp}
                    tone={c.coverageBp >= 10000 ? "good" : c.coverageBp >= 8000 ? "warn" : "bad"}
                    className="mt-1.5"
                  />
                </li>
              ))}
            </ul>
          </Card>

          {exports.length > 0 ? (
            <Card>
              <CardHead title="Recent exports" hint="Every UDISE+ export generated for this school" />
              <ul className="divide-y divide-line">
                {exports.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">
                        {e.kind.charAt(0) + e.kind.slice(1).toLowerCase()} · {e.academicYear}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-ink-3">
                        {e.generatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <span className="tnum shrink-0 text-[12.5px] font-semibold">{e.rowCount} rows</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHead title="Why this matters" />
            <div className="space-y-2.5 px-5 py-4 text-[12.5px] leading-snug text-ink-2">
              <p>
                APAAR is mandatory for every student in Class 1–12 for 2026-27. Students without an ID
                <strong> block the school's data certification</strong>, not just their own record.
              </p>
              <p>
                Parent consent must be captured <strong>before</strong> an ID is generated, and the
                portal rejects generation when the school's spelling does not match Aadhaar — which is
                why the mismatch check runs here rather than after a failed submission.
              </p>
              <p className="flex items-start gap-2 border-t border-line pt-2.5">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand" />
                <span>
                  Consent for APAAR is recorded in the{" "}
                  <Link href="/app/consent" className="font-semibold text-brand hover:underline">
                    DPDP consent register
                  </Link>
                  , with how each parent was verified.
                </span>
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
