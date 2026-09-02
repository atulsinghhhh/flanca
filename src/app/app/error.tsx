"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";

/**
 * When something breaks inside the school's own app.
 *
 * A school does not need a stack trace; it needs to know whether it lost the
 * receipt it was in the middle of writing. Because every write goes through a
 * server action inside a transaction, a failed page render never leaves a
 * half-finished record — so the page can say so plainly, and mean it.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="mx-auto max-w-xl p-6 sm:p-8">
      <span className="flex size-10 items-center justify-center rounded-lg bg-overdue-light text-overdue">
        <TriangleAlert className="size-5" />
      </span>

      <h1 className="mt-4 font-display text-[22px] font-semibold">This screen could not be loaded.</h1>

      <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">
        Nothing has been lost. Anything you had already saved is saved — a page that fails to load cannot
        leave a half-written receipt, mark or admission behind. Try again, and if it keeps happening tell
        us what you were doing and we will fix it.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={reset}>
          <RotateCcw className="size-4" /> Try again
        </Button>
        <Link href="/app" className="text-[13.5px] font-semibold text-ink-2 hover:text-brand">
          Back to my screen
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-6 border-t border-line pt-4 text-[12px] text-ink-3">
          Reference <span className="tnum font-semibold">{error.digest}</span> — quote this and we can find
          exactly what happened.
        </p>
      ) : null}
    </Card>
  );
}
