import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";
import { Mark } from "@/components/shell/mark";

export const metadata = {
  title: "A look around — Flanca",
  description:
    "This deployment of Flanca has no school database attached. The front page is here; the screens that hold a child's record are not.",
  robots: { index: false, follow: false },
};

/**
 * Where every screen lands on a preview deployment.
 *
 * The alternative was to fake it — seed a demo school and let a visitor walk
 * through invented children. That is a worse promise than an empty page: the
 * first thing a principal asks about a demo is whose data it is. So this says
 * plainly that there is no database here, and points at the two things that are
 * real: the front page and the tutor, which is live.
 */
export default function PreviewPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-5 py-12">
      <div className="mb-7 flex items-center gap-2.5">
        <Mark size={26} />
        <span className="font-display text-[19px] font-semibold tracking-[-0.02em]">Flanca</span>
      </div>

      <div className="card w-full max-w-lg p-7">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-paper-2 text-ink-3">
            <Database className="size-4.5" />
          </span>
          <div>
            <h1 className="font-display text-[20px] font-semibold">
              This is the front page, not the school
            </h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
              Flanca keeps each school&rsquo;s records in that school&rsquo;s own database. No
              database is attached to this address, so the screens behind it — admissions, the fee
              counter, attendance, report cards — are closed rather than filled with invented
              children.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/"
            className="flex h-10 items-center justify-center gap-1.5 rounded-md bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-dark"
          >
            See what Flanca does <ArrowRight className="size-3.5" />
          </Link>
          <a
            href="https://tutor.flanca.online"
            className="flex h-10 items-center justify-center rounded-md border border-line-2 bg-white px-4 text-[14px] font-semibold hover:bg-paper-2"
          >
            Open the AI tutor
          </a>
        </div>

        <p className="mt-5 border-t border-line pt-4 text-[12.5px] leading-snug text-ink-3">
          Setting up a real one takes an afternoon and your existing register. Ask for a walkthrough
          on your own data at{" "}
          <a href="https://flanca.online" className="font-semibold text-ink-2 hover:text-brand">
            flanca.online
          </a>
          .
        </p>
      </div>
    </div>
  );
}
