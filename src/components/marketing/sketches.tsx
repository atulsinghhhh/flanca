/**
 * Marginalia — the landing page's only imagery.
 *
 * Monoline, unfilled, deliberately a little wobbly: these are drawings, not
 * icons. They carry mood, never meaning, so every one is aria-hidden and can be
 * dropped on a small screen without losing a word of the argument.
 *
 * Everything strokes `currentColor`, so a sketch takes the colour of whatever
 * it is dropped into — forest ink on cream, cream on terracotta.
 */

type Sketch = { className?: string; strokeWidth?: number };

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** A school register page, ruled and half-filled in. */
export function SketchRegister({ className, strokeWidth = 1.6 }: Sketch) {
  return (
    <svg viewBox="0 0 120 140" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M22 10c26-3 51-2 77 2 3 30 3 89-1 118-26 4-51 4-77 1-3-30-3-91 1-121z" />
      <path d="M14 28l7 2M13 62l8 1M14 96l7 1" />
      <path d="M34 38c19-2 38-1 56 1M34 60c19-2 38-1 56 1M34 82c19-2 38-1 56 1M34 104c11-1 22-1 33 0" />
      <path d="M26 34l4 5 6-9M26 78l4 5 6-9" />
      <path d="M40 53c4-4 8 3 12 0s8-4 12 0 8 3 12 0" />
      <path d="M40 75c4-4 8 3 12 0s8-4 12 0" />
    </svg>
  );
}

/** A stack of loose sheets, seen from above and slightly askew. */
export function SketchPapers({ className, strokeWidth = 1.6 }: Sketch) {
  return (
    <svg viewBox="0 0 130 112" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M12 78l52-22 46 20-52 22z" />
      <path d="M15 60l52-22 46 20-52 22z" />
      <path d="M18 42l52-22 46 20-52 22z" />
      <path d="M40 34c5-3 10 1 15-1M52 40c6-3 12 1 18-1M62 46c6-3 13 1 19-1" />
    </svg>
  );
}

/** A small schoolhouse with the flag up. */
export function SketchSchool({ className, strokeWidth = 1.6 }: Sketch) {
  return (
    <svg viewBox="0 0 144 116" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M18 54 72 20l54 34" />
      <path d="M28 54v44c29 3 59 3 88 0V54" />
      <path d="M63 98V74c6-4 12-4 18 0v24" />
      <path d="M39 66c5-1 10-1 15 0v13c-5 1-10 1-15 0zM90 66c5-1 10-1 15 0v13c-5 1-10 1-15 0z" />
      <path d="M72 20V6M72 8c6-3 13 3 19 0v9c-6 3-13-3-19 0z" />
      <path d="M12 100c40 5 80 5 120 0" />
    </svg>
  );
}

/** A rupee coin, mid-spin. */
export function SketchCoin({ className, strokeWidth = 1.6 }: Sketch) {
  return (
    <svg viewBox="0 0 104 104" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M52 8c24 0 44 20 44 44s-20 44-44 44S8 76 8 52 28 8 52 8z" />
      <path d="M52 16c20 0 36 16 36 36" />
      <path d="M39 36h27M39 47h27M60 36c1 11-8 12-19 11l20 22" />
    </svg>
  );
}

/** An office rubber stamp — the sound a school makes when a thing is done. */
export function SketchStamp({ className, strokeWidth = 1.6 }: Sketch) {
  return (
    <svg viewBox="0 0 116 104" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M42 16c5-7 26-7 31 0l5 22H37z" />
      <path d="M24 44c23-3 46-3 69 0l4 15c-25 3-52 3-77 0z" />
      <path d="M28 74c20 3 41 3 61 0M20 84c26 4 52 4 78 0" />
      <path d="M50 26c4-2 9-2 13 0" />
    </svg>
  );
}

/** The thin connector between two steps of a flow. */
export function SketchArrow({ className, strokeWidth = 1.4 }: Sketch) {
  return (
    <svg viewBox="0 0 124 20" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M4 11c36-4 74-4 112-1" />
      <path d="M107 5l9 5-9 6" />
    </svg>
  );
}

/** Two passes of a marker under a word. Drawn in yellow, not ink. */
export function SketchUnderline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 14" className={className} fill="none" stroke="currentColor" strokeWidth={4.5} strokeLinecap="round" aria-hidden preserveAspectRatio="none">
      <path d="M5 8c42-5 102-6 190-3" />
      <path d="M14 12c44-4 96-5 178-2" opacity="0.7" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   More marginalia. A school has a lot of objects in it.
   ────────────────────────────────────────────────────────────────────────── */

/** A wobbly rule, drawn freehand. Section divider. */
export function SketchRule({ className, strokeWidth = 1.5 }: Sketch) {
  return (
    <svg viewBox="0 0 200 12" className={className} strokeWidth={strokeWidth} {...base} preserveAspectRatio="none">
      <path d="M4 7c32-4 66 3 98-1s62-4 94 1" />
    </svg>
  );
}

/** A four-point sparkle, the way a pen draws one. */
export function SketchStar({ className, strokeWidth = 1.5 }: Sketch) {
  return (
    <svg viewBox="0 0 40 40" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M20 4c1 9 5 14 15 16-10 2-14 7-15 16-1-9-5-14-15-16 10-2 14-7 15-16z" />
    </svg>
  );
}

/** A loop scribbled round a word — two passes, like a pen going twice. */
export function SketchLoop({ className, strokeWidth = 2.4 }: Sketch) {
  return (
    <svg viewBox="0 0 200 90" className={className} strokeWidth={strokeWidth} {...base} preserveAspectRatio="none">
      <path d="M28 12c48-8 116-6 158 8 10 14-2 40-30 50-46 16-116 14-146-4-10-14 4-38 30-46" />
      <path d="M16 62c14 14 74 22 128 16 24-3 42-10 48-18" opacity="0.75" />
    </svg>
  );
}

/** A curved arrow with a hooked head, for pointing at things in the margin. */
export function SketchArrowCurve({ className, strokeWidth = 1.5 }: Sketch) {
  return (
    <svg viewBox="0 0 80 70" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M8 8c24-2 46 10 52 34" />
      <path d="M50 34l10 10 10-12" />
    </svg>
  );
}

/** The bell that ends the period. */
export function SketchBell({ className, strokeWidth = 1.6 }: Sketch) {
  return (
    <svg viewBox="0 0 100 104" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M50 16c16 0 26 12 27 28 1 14 4 22 11 30-25 4-51 4-76 0 7-8 10-16 11-30 1-16 11-28 27-28z" />
      <path d="M50 16v-8M42 84c2 8 14 8 16 0" />
      <path d="M14 24c-3 6-4 12-3 18M86 24c3 6 4 12 3 18" />
    </svg>
  );
}

/** A graduation cap, tassel swinging. */
export function SketchCap({ className, strokeWidth = 1.6 }: Sketch) {
  return (
    <svg viewBox="0 0 120 86" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M60 14 8 34l52 20 52-20z" />
      <path d="M24 42v22c11 8 61 8 72 0V42" />
      <path d="M104 27v26c0 6-6 8-8 3" />
    </svg>
  );
}

/** The clock above the blackboard. */
export function SketchClock({ className, strokeWidth = 1.6 }: Sketch) {
  return (
    <svg viewBox="0 0 100 100" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M50 8c23 0 42 19 42 42S73 92 50 92 8 73 8 50 27 8 50 8z" />
      <path d="M50 24v27l18 10" />
      <path d="M50 14v4M86 50h-4M50 86v-4M14 50h4" />
    </svg>
  );
}

/** The school bus, badly parked. */
export function SketchBus({ className, strokeWidth = 1.6 }: Sketch) {
  return (
    <svg viewBox="0 0 140 90" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M14 22c34-4 72-4 106 0 6 10 8 26 6 42-36 4-78 4-114 0-3-16-1-32 2-42z" />
      <path d="M32 30c10-1 20-1 30 0v18c-10 1-20 1-30 0zM74 30c10-1 20-1 30 0v18c-10 1-20 1-30 0z" />
      <path d="M34 64c0 7 11 7 11 0s-11-7-11 0zM95 64c0 7 11 7 11 0s-11-7-11 0z" />
      <path d="M18 70h12M110 70h10" />
    </svg>
  );
}

/** A pencil across a ruler. */
export function SketchTools({ className, strokeWidth = 1.6 }: Sketch) {
  return (
    <svg viewBox="0 0 120 96" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M16 62c26-14 52-28 78-40l10 16c-26 14-52 28-78 42z" />
      <path d="M94 22l10 16M22 74l-8 8 12-4" />
      <path d="M12 30c22 6 44 16 64 30l-6 10c-22-12-44-22-64-28z" />
      <path d="M28 36l-4 7M42 42l-4 7M56 48l-4 7" />
    </svg>
  );
}

/** A trophy for the annual day. */
export function SketchTrophy({ className, strokeWidth = 1.6 }: Sketch) {
  return (
    <svg viewBox="0 0 100 104" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M28 14c14-2 30-2 44 0 2 20-4 38-22 40-18-2-24-20-22-40z" />
      <path d="M28 22c-8-2-14 2-12 10 2 7 7 11 14 12M72 22c8-2 14 2 12 10-2 7-7 11-14 12" />
      <path d="M50 54v18M36 90c4-12 24-12 28 0-9 2-19 2-28 0z" />
    </svg>
  );
}

/** A globe on its stand. */
export function SketchGlobe({ className, strokeWidth = 1.6 }: Sketch) {
  return (
    <svg viewBox="0 0 100 108" className={className} strokeWidth={strokeWidth} {...base}>
      <path d="M50 8c20 0 36 16 36 36S70 80 50 80 14 64 14 44 30 8 50 8z" />
      <path d="M50 8c-12 8-16 22-16 36s4 28 16 36c12-8 16-22 16-36S62 16 50 8z" />
      <path d="M16 34c22 5 46 5 68 0M16 54c22 5 46 5 68 0" />
      <path d="M50 80v14M34 100c8-6 24-6 32 0-10 2-22 2-32 0" />
    </svg>
  );
}
