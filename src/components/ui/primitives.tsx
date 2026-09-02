import Link from "next/link";
import { cn } from "@/lib/utils";

/* ── Card ─────────────────────────────────────────────────────────────── */

export function Card({
  className,
  children,
  ...rest
}: React.ComponentProps<"section">) {
  return (
    <section className={cn("card", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHead({
  title,
  hint,
  action,
  className,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col items-start gap-3 border-b border-line px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] leading-tight font-semibold">{title}</h2>
        {hint ? <p className="mt-0.5 text-[12.5px] text-ink-3">{hint}</p> : null}
      </div>
      {action ? <div className="w-full shrink-0 sm:w-auto">{action}</div> : null}
    </header>
  );
}

/* ── Buttons ──────────────────────────────────────────────────────────── */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-[background-color,color,border-color,transform] disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 select-none active:translate-y-0";

const BUTTON_VARIANTS = {
  primary: "bg-brand text-white hover:bg-brand-dark hover:-translate-y-px",
  secondary: "bg-white text-ink border border-line-2 hover:bg-paper-2 hover:-translate-y-px",
  ghost: "text-ink-2 hover:bg-paper-2 hover:text-ink",
  danger: "bg-overdue text-white hover:brightness-90 hover:-translate-y-px",
  quiet: "bg-paper-2 text-ink-2 border border-line hover:bg-white",
} as const;

const BUTTON_SIZES = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9.5 px-4 text-[14px]",
  lg: "h-11 px-5 text-[15px]",
} as const;

type ButtonLook = {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ComponentProps<"button"> & ButtonLook) {
  return (
    <button
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...rest}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ComponentProps<typeof Link> & ButtonLook) {
  return (
    <Link
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...rest}
    />
  );
}

/* ── Badge ────────────────────────────────────────────────────────────── */

const TONES = {
  neutral: "bg-paper-2 text-ink-2 border-line-2",
  good: "bg-good-light text-good border-good/25",
  warn: "bg-marigold-light text-marigold-ink border-marigold/30",
  bad: "bg-overdue-light text-overdue border-overdue/25",
  info: "bg-info-light text-info border-info/25",
  brand: "bg-brand-light text-brand-ink border-brand/25",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Stat tile ────────────────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow text-ink-3">{label}</p>
        {icon ? <span className="text-ink-3">{icon}</span> : null}
      </div>
      <p
        className={cn(
          "mt-1.5 font-display text-[20px] leading-tight font-semibold tnum break-words sm:text-[26px] sm:leading-none",
          tone === "bad" && "text-overdue",
          tone === "good" && "text-good",
          tone === "warn" && "text-marigold-ink",
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">{sub}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="card block min-w-0 px-4 py-3.5 transition-colors hover:border-line-2 hover:bg-white"
      >
        {body}
      </Link>
    );
  }
  return <div className="card min-w-0 px-4 py-3.5">{body}</div>;
}

/* ── Page header ──────────────────────────────────────────────────────── */

export function PageHead({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: string;
  title: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow text-ink-3 mb-1">{eyebrow}</p> : null}
        <h1 className="font-display text-[25px] leading-tight font-semibold">{title}</h1>
        {sub ? <p className="mt-1 max-w-2xl text-[13.5px] text-ink-2">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/* ── Empty state — honest, never a fake number ───────────────────────── */

export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="font-display text-[15px] font-semibold text-ink-2">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-3">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* ── Progress meter ───────────────────────────────────────────────────── */

export function Meter({
  valueBp,
  tone = "brand",
  className,
}: {
  valueBp: number;
  tone?: Tone;
  className?: string;
}) {
  const fill = {
    brand: "bg-brand",
    good: "bg-good",
    warn: "bg-marigold",
    bad: "bg-overdue",
    info: "bg-info",
    neutral: "bg-ink-3",
  }[tone];

  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-paper-2", className)}>
      <div
        className={cn("h-full rounded-full transition-[width]", fill)}
        style={{ width: `${Math.min(100, Math.max(0, valueBp / 100))}%` }}
      />
    </div>
  );
}
