"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Printer, Send } from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/components/ui/primitives";
import { issueLogins, previewLogins, type Slip } from "./actions";

export type ClassRow = { id: string; name: string; active: number; withLogin: number };

type Preview = Awaited<ReturnType<typeof previewLogins>>;

/**
 * Preview, issue, print — and the printing is not optional.
 *
 * The codes live in this component's state and nowhere else: they were hashed
 * before they reached the database and are never logged. So the slips are shown
 * with a print button and a warning, and leaving the page loses them, which is
 * the correct trade — the alternative is four hundred working credentials sitting
 * in an audit table.
 */
export function LoginIssuer({ rows, domain }: { rows: ClassRow[]; domain: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [scope, setScope] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [slips, setSlips] = useState<{ slips: Slip[]; label: string; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function look(classId: string | null, key: string) {
    setError(null);
    setSlips(null);
    setPreview(null);
    setScope(key);
    start(async () => setPreview(await previewLogins(classId)));
  }

  function issue(classId: string | null) {
    setError(null);
    start(async () => {
      const r = await issueLogins(classId);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setSlips(r);
      setPreview(null);
      router.refresh();
    });
  }

  if (slips) {
    return (
      <Card>
        <CardHead
          title={`${slips.slips.length} login${slips.slips.length === 1 ? "" : "s"} for ${slips.label}`}
          hint="These codes are shown once. Print them now — leaving this page loses them, and the only way back is a reset."
          action={
            <Button size="sm" onClick={() => window.print()} className="no-print">
              <Printer className="size-4" /> Print slips
            </Button>
          }
        />

        <p className="no-print border-b border-line bg-marigold-light px-5 py-2.5 text-[13px] text-marigold-ink-strong">
          Cut along the rows and send one home with each child. Each child must pick their own
          password the first time they sign in.
        </p>

        <div className="divide-y divide-line">
          {slips.slips.map((s) => (
            <div key={s.admissionNumber} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-3">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold">{s.name}</p>
                <p className="text-[12.5px] text-ink-3">
                  {s.className} · {s.admissionNumber}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[13px]">{s.email}</p>
                <p className="font-mono text-[15px] font-semibold tracking-wider">{s.code}</p>
              </div>
            </div>
          ))}
        </div>

        {slips.skipped > 0 ? (
          <p className="border-t border-line px-5 py-3 text-[13px] text-ink-3">
            {slips.skipped} child{slips.skipped === 1 ? "" : "ren"} already had a login and were left
            alone.
          </p>
        ) : null}

        <div className="no-print border-t border-line px-5 py-3">
          <Button size="sm" variant="ghost" onClick={() => setSlips(null)}>
            Done printing
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHead
        title="Give a class their logins"
        hint={`Addresses are built as name.admission@${domain} — an identifier a child can read off a slip, not a mailbox.`}
        action={
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => look(null, "all")}>
            {pending && scope === "all" ? <Loader2 className="size-4 animate-spin" /> : null}
            Check the whole school
          </Button>
        }
      />

      {error ? (
        <p className="border-b border-line bg-overdue-light px-5 py-3 text-[13.5px] text-overdue">{error}</p>
      ) : null}

      {preview && "plan" in preview ? (
        <div className="border-b border-line bg-paper-2 px-5 py-4">
          <p className="text-[14px] font-semibold">{preview.label} — nothing has been created yet</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="good">{preview.plan.create.length} new logins</Badge>
            {preview.plan.skipped.length > 0 ? (
              <Badge>{preview.plan.skipped.length} already have one</Badge>
            ) : null}
            {preview.plan.collisions.length > 0 ? (
              <Badge tone="bad">{preview.plan.collisions.length} address clashes</Badge>
            ) : null}
          </div>

          {preview.plan.create.length > 0 ? (
            <p className="mt-2.5 font-mono text-[12.5px] text-ink-3">
              e.g. {preview.plan.create[0].email}
            </p>
          ) : null}

          {preview.plan.collisions.length > 0 ? (
            <ul className="mt-3 space-y-0.5 text-[13px] text-overdue">
              {preview.plan.skipped
                .filter((s) => s.reason.includes("taken"))
                .slice(0, 6)
                .map((s) => (
                  <li key={s.admissionNumber}>
                    {s.admissionNumber}: {s.reason}
                  </li>
                ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={pending || preview.plan.create.length === 0}
              onClick={() => issue(scope === "all" ? null : scope)}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Create {preview.plan.create.length} and show the codes
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPreview(null)}>
              Not now
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-ink-3">
              <th className="px-5 py-2 font-semibold">Class</th>
              <th className="px-3 py-2 text-right font-semibold">On the roll</th>
              <th className="px-3 py-2 text-right font-semibold">Can sign in</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const gap = Math.max(0, r.active - r.withLogin);
              return (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-medium">{r.name}</td>
                  <td className="px-3 py-2.5 text-right tnum">{r.active}</td>
                  <td className="px-3 py-2.5 text-right tnum">
                    <span className={gap === 0 && r.active > 0 ? "text-good" : undefined}>{r.withLogin}</span>
                  </td>
                  <td className="px-5 py-2 text-right">
                    <Button
                      size="sm"
                      variant={gap > 0 ? "secondary" : "quiet"}
                      disabled={pending || gap === 0}
                      onClick={() => look(r.id, r.id)}
                    >
                      {pending && scope === r.id ? <Loader2 className="size-4 animate-spin" /> : null}
                      {gap > 0 ? `Give ${gap} a login` : "All done"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
