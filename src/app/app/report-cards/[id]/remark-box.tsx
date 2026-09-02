"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button, Card, CardHead } from "@/components/ui/primitives";
import { saveRemark } from "@/app/app/exams/actions";

const SUGGESTIONS = [
  "Consistent and attentive in class. Keep it up.",
  "Steady progress. Needs to revise regularly.",
  "Capable, but must complete work on time.",
  "Needs close attention in Mathematics and Science. Parent meeting advised.",
];

export function RemarkBox({
  reportCardId,
  initial,
  principalInitial,
  showPrincipalRemark,
}: {
  reportCardId: string;
  initial: string;
  principalInitial?: string;
  showPrincipalRemark?: boolean;
}) {
  return (
    <div className="space-y-4">
      <SingleRemark
        reportCardId={reportCardId}
        initial={initial}
        field="classTeacher"
        title="Class teacher's remark"
      />
      {showPrincipalRemark ? (
        <SingleRemark
          reportCardId={reportCardId}
          initial={principalInitial ?? ""}
          field="principal"
          title="Principal's remark"
        />
      ) : null}
    </div>
  );
}

function SingleRemark({
  reportCardId,
  initial,
  field,
  title,
}: {
  reportCardId: string;
  initial: string;
  field: "classTeacher" | "principal";
  title: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(false);
    start(async () => {
      const r = await saveRemark(reportCardId, value, field);
      if (!r.error) {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHead title={title} hint="Printed on the card. Pick a starting point or write your own." />
      <div className="space-y-3 px-5 py-4">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={2}
          placeholder="Write a short, specific remark…"
          className="w-full rounded-md border border-line-2 bg-white px-3 py-2 text-[14px] outline-none focus:border-brand"
        />
        {field === "classTeacher" ? (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setValue(s)}
                className="rounded-full border border-line-2 bg-white px-2.5 py-1 text-[12px] text-ink-2 hover:bg-paper-2"
              >
                {s.length > 42 ? `${s.slice(0, 42)}…` : s}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Save remark
          </Button>
          {saved ? <span className="text-[12.5px] text-good">Saved.</span> : null}
        </div>
      </div>
    </Card>
  );
}
