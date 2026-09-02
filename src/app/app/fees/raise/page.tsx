import Link from "next/link";
import { CircleSlash, Clock3, Info } from "lucide-react";
import { requireRole, MONEY } from "@/lib/session";
import { formatMoney } from "@/lib/core/money";
import { planTermBilling } from "@/lib/core/fees-core";
import { gatherTermBilling } from "@/lib/queries/fees";
import { Badge, Card, CardHead, Empty, PageHead, Stat } from "@/components/ui/primitives";
import { RaiseForm } from "./raise-form";

export const metadata = { title: "Raise invoices — Flanca" };

/**
 * Bill a term.
 *
 * Everything on this page is computed by the same two functions the write uses, so
 * a school is never shown one number and charged another. The per-class table is
 * the point: a total of ₹18 lakh means nothing on its own, but "Class 10, 78
 * children, ₹11.1 lakh" is a line an accountant can check against last term.
 */
export default async function RaiseInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const actor = await requireRole(...MONEY);
  const { term } = await searchParams;

  const firstPass = await gatherTermBilling(actor.schoolId, term ?? "");
  if (!firstPass || firstPass.termCount === 0) {
    return (
      <>
        <PageHead eyebrow="Money" title="Raise invoices" />
        <Card className="mt-5">
          <Empty
            title="No terms to raise"
            hint="Fees are billed per term. Set up the year's terms on the fee structure screen first."
          />
        </Card>
      </>
    );
  }

  // Default to the first term that is not fully raised — the one a school in the
  // middle of a year actually came here for.
  let label = term && firstPass.termLabels.includes(term) ? term : "";
  const gathered = label ? firstPass : null;
  let data = gathered;

  if (!label) {
    for (const l of firstPass.termLabels) {
      const g = await gatherTermBilling(actor.schoolId, l);
      if (!g) continue;
      const p = planTermBilling({ candidates: g.candidates, share: g.share });
      if (p.toRaise.length > 0) {
        label = l;
        data = g;
        break;
      }
    }
    if (!label) {
      label = firstPass.termLabels[firstPass.termLabels.length - 1];
      data = await gatherTermBilling(actor.schoolId, label);
    }
  }

  const g = data!;
  const plan = planTermBilling({ candidates: g.candidates, share: g.share });
  const toRaiseIds = new Set(plan.toRaise.map((r) => r.studentId));
  const netByStudent = new Map(plan.toRaise.map((r) => [r.studentId, r.totals.net]));

  type Row = { className: string; toRaise: number; already: number; ineligible: number; net: number };
  const byClass = new Map<string, Row>();
  for (const c of g.candidates) {
    const row = byClass.get(c.className) ?? { className: c.className, toRaise: 0, already: 0, ineligible: 0, net: 0 };
    if (toRaiseIds.has(c.studentId)) {
      row.toRaise += 1;
      row.net += netByStudent.get(c.studentId) ?? 0;
    } else if (c.alreadyRaised) row.already += 1;
    else row.ineligible += 1;
    byClass.set(c.className, row);
  }
  const rows = [...byClass.values()];

  return (
    <>
      <PageHead
        eyebrow="Money"
        title="Raise invoices"
        sub={`One term at a time, for every child who does not already have an invoice for it. Amounts are ${
          g.termCount === 4 ? "a quarter" : `a ${g.termCount}th`
        } of each class's annual fee, with concessions applied per head.`}
      />

      <div className="flex flex-wrap items-center gap-2">
        {g.termLabels.map((l) => (
          <Link
            key={l}
            href={`/app/fees/raise?term=${encodeURIComponent(l)}`}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${
              l === label
                ? "border-brand bg-brand text-white"
                : "border-line-2 bg-white text-ink-2 hover:border-brand hover:text-brand"
            }`}
          >
            {l}
          </Link>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="To raise" value={plan.toRaise.length} sub={`children with no ${label} invoice`} />
        <Stat label="Amount" value={formatMoney(plan.net)} sub="after concessions" />
        <Stat label="Already raised" value={plan.alreadyRaised} sub="left untouched" />
        <Stat
          label="Not billable"
          value={plan.notEligible}
          sub={plan.notEligible === 0 ? "every child is priced" : "class not priced for this term"}
        />
      </div>

      <div className="mt-5">
        <RaiseForm
          label={label}
          count={plan.toRaise.length}
          netText={formatMoney(plan.net)}
          disabledReason={
            plan.toRaise.length > 0
              ? null
              : plan.alreadyRaised > 0
                ? `${label} is fully raised — all ${plan.alreadyRaised} invoices exist. Nothing to do.`
                : `Nothing to bill for ${label}. No class has fees priced for it.`
          }
        />
      </div>

      {g.unapproved > 0 ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-marigold/30 bg-marigold-light/50 px-4 py-3 text-[13px] text-ink-2">
          <Clock3 className="mt-0.5 size-4 shrink-0 text-marigold" />
          {g.unapproved} {g.unapproved === 1 ? "concession is" : "concessions are"} still waiting for approval
          and will not be applied. Approve them first if they should come off this term.
        </p>
      ) : null}

      <Card className="mt-5 overflow-hidden">
        <CardHead
          title={`${label} by class`}
          hint="Check a class against what it was billed last term before committing."
          action={<Badge tone="brand">{formatMoney(plan.net)}</Badge>}
        />
        <div className="overflow-x-auto">
          <table className="ruled w-full min-w-[560px]">
            <thead>
              <tr>
                <th>Class</th>
                <th className="num">To raise</th>
                <th className="num">Already has one</th>
                <th className="num">Not billable</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.className}>
                  <td data-title className="font-medium whitespace-nowrap">{r.className}</td>
                  <td data-label="To raise" className="num">{r.toRaise || <span className="text-ink-3">—</span>}</td>
                  <td data-label="Already has one" className="num text-ink-2">{r.already || <span className="text-ink-3">—</span>}</td>
                  <td data-label="Not billable" className="num">
                    {r.ineligible ? (
                      <span className="inline-flex items-center gap-1 text-marigold">
                        <CircleSlash className="size-3" />
                        {r.ineligible}
                      </span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td data-label="Amount" className="num font-semibold">
                    {r.net ? formatMoney(r.net) : <span className="text-ink-3">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-line bg-white px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-ink-3" />
        <p className="text-[13px] leading-relaxed text-ink-2">
          Raising a term twice does nothing the second time — a child who already has a {label} invoice is
          skipped, never billed again. Transport is charged from the child's own stop, not per class, so
          only the families who use the bus see that line.{" "}
          <Link href="/app/fees/structures" className="font-semibold text-brand hover:underline">
            Change the amounts
          </Link>{" "}
          before raising, not after: an invoice carries its own copy of every line.
        </p>
      </div>
    </>
  );
}
