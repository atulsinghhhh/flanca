import Link from "next/link";
import { Coins, Landmark, Search, ShieldCheck, Table2, Receipt } from "lucide-react";
import { requireRole, MONEY } from "@/lib/session";
import { getDuesReport, getFeeTotals } from "@/lib/queries/fees";
import { getClassOptions } from "@/lib/queries/students";
import { formatMoney } from "@/lib/core/money";
import { formatPercent } from "@/lib/core/grading-core";
import { ButtonLink, Card, CardHead, Empty, Meter, PageHead, Stat } from "@/components/ui/primitives";
import { AgeingBar } from "@/components/ui/spark";
import { DefaulterTable } from "./defaulter-table";

export const metadata = { title: "Fees & dues — Flanca" };

const BUCKETS = [
  { value: "", label: "All outstanding" },
  { value: "CURRENT", label: "Not yet due" },
  { value: "1-30", label: "1–30 days" },
  { value: "31-60", label: "31–60 days" },
  { value: "61-90", label: "61–90 days" },
  { value: "90+", label: "Over 90 days" },
] as const;

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classId?: string; bucket?: string; filter?: string }>;
}) {
  const actor = await requireRole(...MONEY);
  const sp = await searchParams;

  const bucket = BUCKETS.find((b) => b.value && b.value === sp.bucket)?.value;
  const [totals, dues, classes] = await Promise.all([
    getFeeTotals(actor.schoolId),
    getDuesReport(actor.schoolId, {
      q: sp.q?.trim() || undefined,
      classId: sp.classId || undefined,
      bucket: bucket as never,
    }),
    getClassOptions(actor.schoolId),
  ]);

  // "?filter=overdue" comes from the Overview tile.
  const rows = sp.filter === "overdue" ? dues.rows.filter((r) => r.daysOverdue > 0) : dues.rows;
  const totalListed = rows.reduce((a, r) => a + r.outstanding, 0);

  return (
    <>
      <PageHead
        eyebrow="Money"
        title="Fees & dues"
        sub="Head-wise itemised invoices, receipts with a gap-free number, and a defaulter list ordered by how long the money has been waiting."
        actions={
          <>
            <ButtonLink href="/app/fees/structures" variant="secondary" size="sm">
              <Table2 className="size-4" /> Fee structure
            </ButtonLink>
            <ButtonLink href="/app/fees/raise" variant="secondary" size="sm">
              <Receipt className="size-4" /> Raise invoices
            </ButtonLink>
            <ButtonLink href="/app/accounts" variant="secondary" size="sm">
              <Landmark className="size-4" /> Day book
            </ButtonLink>
            <ButtonLink href="/app/fees/collect" size="sm">
              <Coins className="size-4" /> Fee counter
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Billed this year"
          value={formatMoney(totals.billed)}
          sub={`${totals.invoiceCount} invoices raised`}
        />
        <Stat
          label="Collected"
          value={formatMoney(totals.collected)}
          tone="good"
          sub={`${formatPercent(totals.collectedBp, 1)} of billed`}
        />
        <Stat
          label="Outstanding"
          value={formatMoney(totals.total)}
          tone={totals.total > 0 ? "warn" : "good"}
          sub={`${dues.rows.length} students with a balance`}
        />
        <Stat
          label="Overdue"
          value={formatMoney(totals.overdue)}
          tone={totals.overdue > 0 ? "bad" : "good"}
          sub="past the due date"
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHead
            title="Outstanding by age"
            hint="The oldest debt is the one that needs the phone call."
          />
          <div className="px-5 py-4">
            <AgeingBar buckets={totals.buckets} />
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <p className="eyebrow text-ink-3">Collection against billed</p>
                <p className="tnum text-[13px] font-semibold">{formatPercent(totals.collectedBp, 1)}</p>
              </div>
              <Meter valueBp={totals.collectedBp} tone="good" className="mt-1.5" />
            </div>
            {totals.concession > 0 ? (
              <p className="mt-3 text-[12.5px] text-ink-3">
                {formatMoney(totals.concession)} given as concessions (RTE, sibling, staff ward, merit)
                — shown as its own line on every parent's invoice.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHead title="By class" hint="Delegate the follow-up to the class teacher." />
          {dues.classSummary.length === 0 ? (
            <Empty title="No dues anywhere" hint="Every invoice in the school is settled." />
          ) : (
            <ul className="divide-y divide-line">
              {dues.classSummary.slice(0, 9).map((c) => (
                <li key={c.className} className="flex items-center justify-between gap-3 px-5 py-2">
                  <Link
                    href={`/app/fees?classId=${classes.find((k) => k.name === c.className)?.id ?? ""}`}
                    className="text-[13.5px] font-medium hover:text-brand hover:underline"
                  >
                    {c.className}
                  </Link>
                  <div className="text-right">
                    <p className="tnum text-[13.5px] font-semibold">{formatMoney(c.outstanding)}</p>
                    <p className="text-[11px] text-ink-3">{c.students} students</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── the honesty stance, stated where the money is managed ── */}
      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-good/25 bg-good-light px-4 py-2.5">
        <ShieldCheck className="size-4 shrink-0 text-good" />
        <p className="text-[13px] text-good">
          Parents pay by UPI straight to the school — <strong>₹0 convenience fee</strong>, and every
          invoice shows the head-wise breakdown. No aggregator sits in the middle.
        </p>
      </div>

      <Card className="mt-5 overflow-hidden">
        <CardHead
          title="Defaulter list"
          hint={`${rows.length} students · ${formatMoney(totalListed)} outstanding${bucket ? ` in the ${BUCKETS.find((b) => b.value === bucket)!.label.toLowerCase()} bucket` : ""}`}
        />

        <form method="get" className="flex flex-wrap items-end gap-2.5 border-b border-line px-5 py-3">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="q" className="eyebrow text-ink-3 mb-1 block">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" />
              <input
                id="q"
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Student, admission no or father's name"
                className="h-9.5 w-full rounded-md border border-line-2 bg-white pr-3 pl-8.5 text-[14px] outline-none focus:border-brand"
              />
            </div>
          </div>

          <div>
            <label htmlFor="classId" className="eyebrow text-ink-3 mb-1 block">
              Class
            </label>
            <select
              id="classId"
              name="classId"
              defaultValue={sp.classId ?? ""}
              className="h-9.5 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
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
            <label htmlFor="bucket" className="eyebrow text-ink-3 mb-1 block">
              Age
            </label>
            <select
              id="bucket"
              name="bucket"
              defaultValue={sp.bucket ?? ""}
              className="h-9.5 rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
            >
              {BUCKETS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="h-9.5 rounded-md bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-dark"
          >
            Apply
          </button>
          {sp.q || sp.classId || sp.bucket || sp.filter ? (
            <Link href="/app/fees" className="h-9.5 px-2 pt-2 text-[13px] font-semibold text-ink-3 hover:text-ink">
              Clear
            </Link>
          ) : null}
        </form>

        {rows.length === 0 ? (
          <Empty
            title="Nothing outstanding here"
            hint="Either every invoice in this filter is paid, or nothing has been billed yet."
          />
        ) : (
          <DefaulterTable rows={rows} />
        )}
      </Card>
    </>
  );
}
