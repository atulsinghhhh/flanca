import Link from "next/link";

/** The Flanca mark: a ledger rule crossed by a rising stroke. Small on purpose. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden fill="none">
      <rect width="32" height="32" rx="7" fill="var(--color-brand)" />
      <path d="M9 22.5h14" stroke="white" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 17h9" stroke="white" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10.5 13.5 15 9l7 12" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ href = "/app" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <Mark />
      <span className="font-display text-[19px] leading-none font-semibold tracking-[-0.02em]">
        Flanca
      </span>
    </Link>
  );
}
