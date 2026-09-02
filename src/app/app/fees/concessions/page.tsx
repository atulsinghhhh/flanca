import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, MONEY } from "@/lib/session";
import { formatMoney } from "@/lib/core/money";
import { canDeleteConcessionType } from "@/lib/core/concession-core";
import { PageHead, Stat } from "@/components/ui/primitives";
import { ConcessionTypes, FinePolicyCard, PendingApprovals } from "./concession-editor";
import type { FinePolicy, HeadOption, PendingRow, TypeRow } from "./concession-editor";

export const metadata = { title: "Concessions & late fee — Flanca" };

/**
 * What the school gives away, and what it charges for paying late.
 *
 * Both were seed-only, and both decide real money on every invoice raised from here
 * on. Kept on one screen because they are the same conversation: what a family
 * actually ends up owing, either side of the fee.
 */
export default async function ConcessionsPage() {
  const actor = await requireRole(...MONEY);

  const [types, heads, pending, policy, onConcession] = await Promise.all([
    db.concessionType.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, percentage: true, fixedAmount: true, appliesToHeads: true,
        requiresApproval: true, _count: { select: { concessions: true } },
      },
    }),
    db.feeHead.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: [{ sequenceOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    db.studentConcession.findMany({
      where: { schoolId: actor.schoolId, approvedAt: null },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true, percentage: true, fixedAmount: true, note: true,
        student: { select: { name: true, admissionNumber: true } },
        concessionType: { select: { name: true, percentage: true, fixedAmount: true } },
      },
    }),
    db.lateFinePolicy.findFirst({
      where: { schoolId: actor.schoolId },
      select: { graceDays: true, flatAmount: true, perDayAmount: true, maxAmount: true, isActive: true },
    }),
    db.studentConcession.count({ where: { schoolId: actor.schoolId, approvedAt: { not: null } } }),
  ]);

  const typeRows: TypeRow[] = types.map((t) => {
    const guard = canDeleteConcessionType({ students: t._count.concessions });
    return {
      id: t.id,
      name: t.name,
      percentage: t.percentage,
      fixedAmount: t.fixedAmount,
      appliesToHeads: t.appliesToHeads,
      requiresApproval: t.requiresApproval,
      students: t._count.concessions,
      removable: guard.allowed,
      whyNot: guard.reason,
    };
  });

  const pendingRows: PendingRow[] = pending.map((p) => ({
    concessionId: p.id,
    studentName: p.student.name,
    admissionNumber: p.student.admissionNumber,
    typeName: p.concessionType.name,
    worth:
      p.percentage != null
        ? `${p.percentage}%`
        : p.fixedAmount != null
          ? formatMoney(p.fixedAmount)
          : p.concessionType.percentage != null
            ? `${p.concessionType.percentage}%`
            : formatMoney(p.concessionType.fixedAmount ?? 0),
    note: p.note,
  }));

  return (
    <>
      <Link
        href="/app/fees/structures"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Fee structure
      </Link>

      <PageHead
        eyebrow="Money"
        title="Concessions & late fee"
        sub="What the school gives away, and what it charges for paying late. Both are itemised on the parent's invoice — neither is ever folded into the total."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Concession types" value={types.length} sub="each its own line" />
        <Stat label="Children on one" value={onConcession} sub="approved" />
        <Stat
          label="Waiting for approval"
          value={pendingRows.length}
          tone={pendingRows.length > 0 ? "warn" : undefined}
          sub={pendingRows.length > 0 ? "changing nothing yet" : "nothing pending"}
        />
        <Stat
          label="Late fee"
          value={policy?.isActive ? `${policy.graceDays}d grace` : "Off"}
          sub={
            policy?.isActive
              ? `${formatMoney(policy.flatAmount)} flat${policy.perDayAmount ? ` + ${formatMoney(policy.perDayAmount)}/day` : ""}`
              : "nothing charged"
          }
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          <ConcessionTypes types={typeRows} heads={heads as HeadOption[]} />
          <PendingApprovals pendingRows={pendingRows} />
        </div>
        <div className="space-y-5">
          <FinePolicyCard policy={(policy as FinePolicy | null) ?? null} />
          <div className="flex items-start gap-2.5 rounded-lg border border-good/25 bg-good-light/60 px-4 py-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" />
            <p className="text-[12.5px] leading-relaxed text-good">
              A concession only comes off once somebody has approved it, and a late fee is only ever added
              when the counter ticks it. Neither happens quietly, and both show on the invoice by name.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
