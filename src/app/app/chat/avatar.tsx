/**
 * Initials avatars for chat. Deterministic on the name, not random — the same
 * person should look the same in the list and at the top of their conversation.
 *
 * Deliberately skips the "bad" (red) tone from the design system: that colour is
 * reserved for warnings and errors elsewhere in the app, and reusing it here would
 * make an ordinary parent's avatar read as a problem.
 */

const PALETTE = [
  "bg-brand-light text-brand-ink",
  "bg-info-light text-info",
  "bg-marigold-light text-marigold-ink",
  "bg-good-light text-good",
  "bg-paper-2 text-ink-2",
] as const;

function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZES = {
  sm: "size-8 text-[11px]",
  md: "size-9.5 text-[13px]",
  lg: "size-11 text-[15px]",
} as const;

export function Avatar({ name, size = "md" }: { name: string; size?: keyof typeof SIZES }) {
  const tone = PALETTE[hashOf(name) % PALETTE.length];
  return (
    <span
      className={`flex ${SIZES[size]} shrink-0 items-center justify-center rounded-full font-semibold ${tone}`}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}
