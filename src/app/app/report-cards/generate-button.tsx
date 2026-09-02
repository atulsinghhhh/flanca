"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { generateReportCards } from "@/app/app/exams/actions";

export function GenerateButtons({ termId, isPublished }: { termId: string; isPublished: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(publish: boolean) {
    setMessage(null);
    setError(null);
    start(async () => {
      const r = await generateReportCards(termId, publish);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMessage(
        publish
          ? `Published ${r.written} report cards — parents can see them now.`
          : `Generated ${r.written} report cards (not yet published).`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(false)}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />}
          Generate
        </Button>
        {!isPublished ? (
          <Button size="sm" disabled={pending} onClick={() => run(true)}>
            <Send className="size-4" /> Generate & publish
          </Button>
        ) : null}
      </div>
      {message ? <p className="text-[12.5px] text-good">{message}</p> : null}
      {error ? <p className="max-w-md text-[12.5px] text-overdue">{error}</p> : null}
    </div>
  );
}
