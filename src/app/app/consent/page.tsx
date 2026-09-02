import Link from "next/link";
import { CalendarClock, ShieldCheck, TriangleAlert } from "lucide-react";
import { requireRole, OFFICE } from "@/lib/session";
import { CONSENT_PURPOSES, getConsentRegister } from "@/lib/queries/compliance";
import { getClassOptions } from "@/lib/queries/students";
import { formatPercent } from "@/lib/core/grading-core";
import { Card, CardHead, Empty, Meter, PageHead, Stat } from "@/components/ui/primitives";
import { ConsentTable } from "./consent-table";

export const metadata = { title: "Consent (DPDP) — Flanca" };

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ purpose?: string; state?: string; classId?: string; q?: string }>;
}) {
  const actor = await requireRole(...OFFICE);
  const sp = await searchParams;

  const [register, classes] = await Promise.all([
    getConsentRegister(actor.schoolId, {
      purpose: sp.purpose,
      state: sp.state,
      classId: sp.classId,
      q: sp.q?.trim() || undefined,
    }),
    getClassOptions(actor.schoolId),
  ]);

  const weakest = [...register.purposes].sort((a, b) => a.coverageBp - b.coverageBp)[0];

  return (
    <>
      <PageHead
        eyebrow="Compliance"
        title="Consent register (DPDP)"
        sub="The Act requires verifiable parental consent before a child's data is processed — photographs included. A tick-box on the admission form does not qualify, so every record here stores how the parent was verified."
      />

      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-info/25 bg-info-light px-4 py-3">
        <CalendarClock className="size-5 shrink-0 text-info" />
        <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-info">
          <strong className="font-semibold">Consent Manager rules commence 13 November 2026</strong>,
          with the broader obligations by May 2027. The penalty for a children&rsquo;s-data breach runs
          to ₹200 crore, and a school is a data fiduciary — no competitor has built this register.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Students fully covered"
          value={formatPercent(register.fullyCoveredBp, 1)}
          tone={register.fullyCoveredBp >= 9000 ? "good" : "warn"}
          sub={`${register.fullyCovered} of ${register.studentCount} have consent on every purpose`}
          icon={<ShieldCheck className="size-4" />}
        />
        <Stat
          label="Weakest purpose"
          value={weakest ? formatPercent(weakest.coverageBp, 0) : "—"}
          tone={weakest && weakest.coverageBp < 8000 ? "bad" : "warn"}
          sub={weakest?.label ?? ""}
          icon={<TriangleAlert className="size-4" />}
        />
        <Stat
          label="Refusals"
          value={register.purposes.reduce((a, p) => a + p.refused, 0)}
          sub="must be respected, not overridden"
        />
        <Stat
          label="Notice version"
          value="v1.0"
          sub="what parents were shown when they consented"
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <CardHead
            title="Consent by student"
            hint="Select students to capture consent in bulk — a PTM signing drive, for instance."
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
                placeholder="Name or admission number"
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
                Show
              </label>
              <select
                id="state"
                name="state"
                defaultValue={sp.state ?? ""}
                className="h-9 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
              >
                <option value="">Everyone</option>
                <option value="PENDING">Only those with something missing</option>
              </select>
            </div>
            <button className="h-9 rounded-md bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-dark">
              Apply
            </button>
            {sp.q || sp.classId || sp.state ? (
              <Link href="/app/consent" className="h-9 px-2 pt-2 text-[13px] font-semibold text-ink-3 hover:text-ink">
                Clear
              </Link>
            ) : null}
          </form>

          {register.rows.length === 0 ? (
            <Empty title="No students match this filter" />
          ) : (
            <ConsentTable
              rows={register.rows.slice(0, 100)}
              purposes={CONSENT_PURPOSES.map((p) => ({ value: p.value, label: p.label }))}
            />
          )}

          {register.rows.length > 100 ? (
            <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-ink-3">
              Showing the first 100 of {register.rows.length}. Filter by class to work through them.
            </p>
          ) : null}
        </Card>

        <Card>
          <CardHead title="By purpose" hint="Consent is per-purpose — one blanket yes is not consent" />
          <ul className="divide-y divide-line">
            {register.purposes.map((p) => (
              <li key={p.value} className="px-5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] font-medium">{p.label}</span>
                  <span className="tnum text-[12.5px] font-semibold">
                    {formatPercent(p.coverageBp, 0)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{p.note}</p>
                <Meter
                  valueBp={p.coverageBp}
                  tone={p.coverageBp >= 9000 ? "good" : p.coverageBp >= 7000 ? "warn" : "bad"}
                  className="mt-1.5"
                />
                <p className="mt-1 text-[11px] text-ink-3">
                  {p.granted} granted · {p.pending} pending
                  {p.refused > 0 ? ` · ${p.refused} refused` : ""}
                  {p.withdrawn > 0 ? ` · ${p.withdrawn} withdrawn` : ""}
                </p>
              </li>
            ))}
          </ul>
          <div className="border-t border-line bg-brand-light/40 px-5 py-3">
            <p className="text-[12px] leading-snug text-brand-ink">
              Withdrawing consent for APAAR stops the APAAR workflow for that child automatically. A
              right that changes nothing downstream is not a right.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
