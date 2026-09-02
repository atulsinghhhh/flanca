import Link from "next/link";

/**
 * The public 404 — a mistyped school address or a certificate link that has been
 * revoked. It has no app shell, so it carries its own.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
      <p className="eyebrow text-ink-3">Flanca</p>
      <h1 className="mt-3 font-display text-[28px] leading-tight font-semibold sm:text-[34px]">
        This page is not here.
      </h1>
      <p className="mt-4 text-[15.5px] leading-relaxed text-ink-2">
        The address may be mistyped, or the page may have been taken down. If you were checking a
        certificate, the school can confirm it directly.
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-4 text-[14px] font-semibold">
        <Link href="/" className="text-brand hover:text-brand-dark">
          Go to the front page
        </Link>
        <Link href="/verify/enter" className="text-ink-2 hover:text-brand">
          Verify a certificate
        </Link>
        <Link href="/login" className="text-ink-2 hover:text-brand">
          Sign in
        </Link>
      </div>
    </main>
  );
}
