"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Send, Undo2 } from "lucide-react";
import { Badge, Button, Card, CardHead } from "@/components/ui/primitives";
import { applyRoster, previewRoster } from "./actions";

export type ClassRow = {
  id: string;
  name: string;
  active: number;
  classLevel: string | null;
  held: number;
};

type Preview = Awaited<ReturnType<typeof previewRoster>>;
type Applied = Awaited<ReturnType<typeof applyRoster>>;

/**
 * Preview, then approve. The same two steps as the student importer, because the
 * school has already learned them there and because the fear is the same one: a
 * clerk should never find out what software did to their roster afterwards.
 *
 * There is no undo here and the panel does not pretend otherwise. Withdrawal is
 * the reverse of provisioning and it is a roster push like any other, which is
 * said in words under the button rather than implied by a missing one.
 */
export function RosterPanel({ rows, reachable }: { rows: ClassRow[]; reachable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [scope, setScope] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [error, setError] = useState<string | null>(null);

  function look(classId: string | null, key: string) {
    setError(null);
    setApplied(null);
    setPreview(null);
    setScope(key);
    start(async () => {
      const r = await previewRoster(classId);
      if ("error" in r && r.error) setError(r.error);
      else setPreview(r);
    });
  }

  function send(classId: string | null) {
    setError(null);
    start(async () => {
      const r = await applyRoster(classId);
      if ("error" in r && r.error) {
        setError(r.error);
        return;
      }
      setApplied(r);
      setPreview(null);
      router.refresh();
    });
  }

  const busy = pending;

  return (
    <Card>
      <CardHead
        title="Who has a tutor account"
        hint="Sending a class gives each child an account with no password — they get in from their own Flanca login, so there is no second password to remember or to lose."
        action={
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !reachable}
            onClick={() => look(null, "all")}
          >
            {busy && scope === "all" ? <Loader2 className="size-4 animate-spin" /> : null}
            Check the whole school
          </Button>
        }
      />

      {error ? (
        <p className="border-b border-line bg-overdue-light px-5 py-3 text-[13.5px] leading-relaxed text-overdue">
          {error}
        </p>
      ) : null}

      {applied && "outcome" in applied && applied.outcome ? (
        <div className="border-b border-line bg-good-light px-5 py-3 text-[13.5px] leading-relaxed text-ink-2">
          <p className="font-semibold text-good">
            <Check className="mr-1 inline size-4" />
            {applied.label}: {applied.outcome.created} created, {applied.outcome.updated} updated,{" "}
            {applied.outcome.withdrawn} withdrawn
          </p>
          {applied.outcome.skipped.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-ink-3">
              {applied.outcome.skipped.slice(0, 8).map((s) => (
                <li key={s.admissionNumber}>
                  {s.admissionNumber}: {s.reason ?? "refused"}
                </li>
              ))}
              {applied.outcome.skipped.length > 8 ? (
                <li>…and {applied.outcome.skipped.length - 8} more.</li>
              ) : null}
            </ul>
          ) : null}
          {applied.outcome.note ? <p className="mt-2 text-ink-3">{applied.outcome.note}</p> : null}
        </div>
      ) : null}

      {preview && "preview" in preview && preview.preview ? (
        <div className="border-b border-line bg-paper-2 px-5 py-4">
          <p className="text-[14px] font-semibold">
            {preview.label} — nothing has been sent yet
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="good">{preview.preview.counts.create} new accounts</Badge>
            <Badge>{preview.preview.counts.update} kept up to date</Badge>
            {preview.preview.counts.withdraw > 0 ? (
              <Badge tone="warn">{preview.preview.counts.withdraw} withdrawn</Badge>
            ) : null}
            {preview.preview.counts.skip > 0 ? (
              <Badge tone="bad">{preview.preview.counts.skip} refused</Badge>
            ) : null}
          </div>

          {preview.preview.counts.skip > 0 ? (
            <ul className="mt-3 space-y-0.5 text-[13px] text-ink-3">
              {preview.preview.decisions
                .filter((d) => d.action === "skip")
                .slice(0, 8)
                .map((d) => (
                  <li key={`${d.admissionNumber}-${d.reason}`}>{d.reason ?? d.admissionNumber}</li>
                ))}
            </ul>
          ) : null}

          {preview.ignored.length > 0 ? (
            <p className="mt-3 text-[13px] text-ink-3">
              {preview.ignored.length} children who have left have no tutor account and were left
              alone.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => send(scope === "all" ? null : (scope ?? null))}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send it
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPreview(null)}>
              <Undo2 className="size-4" /> Not now
            </Button>
            <span className="text-[12.5px] text-ink-3">
              To take a child off later, mark them transferred here and send the class again.
            </span>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-ink-3">
              <th className="px-5 py-2 font-semibold">Class</th>
              <th className="px-3 py-2 text-right font-semibold">In Flanca</th>
              <th className="px-3 py-2 text-right font-semibold">Has a tutor account</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const gap = Math.max(0, r.active - r.held);
              return (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-medium">{r.name}</td>
                  <td className="px-3 py-2.5 text-right tnum">{r.active}</td>
                  <td className="px-3 py-2.5 text-right tnum">
                    {reachable ? (
                      <span className={gap === 0 && r.active > 0 ? "text-good" : undefined}>{r.held}</span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-right">
                    <Button
                      size="sm"
                      variant={gap > 0 ? "secondary" : "quiet"}
                      disabled={busy || !reachable}
                      onClick={() => look(r.id, r.id)}
                    >
                      {busy && scope === r.id ? <Loader2 className="size-4 animate-spin" /> : null}
                      {gap > 0 ? `Give ${gap} an account` : "Check"}
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-ink-3">
                  No classes between Class 3 and Class 12 yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
