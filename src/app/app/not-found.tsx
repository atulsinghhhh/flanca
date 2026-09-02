import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Card } from "@/components/ui/primitives";

/**
 * A record that is not there — a student who was transferred out, a receipt from
 * a school this login does not belong to, a link somebody pasted from last year.
 *
 * Deliberately not framed as an error. Most of the time nothing has gone wrong:
 * the row is genuinely gone, or was never this school's to see.
 */
export default function AppNotFound() {
  return (
    <Card className="mx-auto max-w-xl p-6 sm:p-8">
      <span className="flex size-10 items-center justify-center rounded-lg bg-paper-2 text-ink-3">
        <FileQuestion className="size-5" />
      </span>

      <h1 className="mt-4 font-display text-[22px] font-semibold">That record is not here.</h1>

      <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">
        It may have been removed, or it may belong to a different school. Nothing has gone wrong — if you
        followed a link from an old message, the record behind it is simply no longer there.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-4 text-[13.5px] font-semibold">
        <Link href="/app" className="text-brand hover:text-brand-dark">
          Back to my screen
        </Link>
        <Link href="/app/students" className="text-ink-2 hover:text-brand">
          Find a student
        </Link>
      </div>
    </Card>
  );
}
