/**
 * Marks → grades → report card. Pure.
 *
 * Percentages are stored in BASIS POINTS (9550 = 95.50%) so a report card
 * reprinted next year is bit-identical to the one the parent already has.
 */

export type GradeBand = {
  grade: string;
  min: number; // inclusive, percent
  max: number; // inclusive, percent
  points?: number;
  remark?: string;
};

export type SubjectMark = {
  subject: string;
  maxMarks: number;
  marks: number | null;
  theoryMarks?: number | null;
  internalMarks?: number | null;
  isAbsent?: boolean;
  passMarks?: number;
};

export const CBSE_8_POINT: GradeBand[] = [
  { grade: "A1", min: 91, max: 100, points: 10, remark: "Outstanding" },
  { grade: "A2", min: 81, max: 90, points: 9, remark: "Excellent" },
  { grade: "B1", min: 71, max: 80, points: 8, remark: "Very Good" },
  { grade: "B2", min: 61, max: 70, points: 7, remark: "Good" },
  { grade: "C1", min: 51, max: 60, points: 6, remark: "Fair" },
  { grade: "C2", min: 41, max: 50, points: 5, remark: "Satisfactory" },
  { grade: "D", min: 33, max: 40, points: 4, remark: "Needs Improvement" },
  { grade: "E", min: 0, max: 32, points: 0, remark: "Needs Much Improvement" },
];

/** Basis points, so 47/50 → 9400 not 93.99999. */
export function percentBp(scored: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((scored / max) * 10000);
}

export function formatPercent(bp: number, decimals = 2): string {
  return `${(bp / 100).toFixed(decimals)}%`;
}

/**
 * Bands are published as integer ranges (A2 = 81–90, A1 = 91–100), which leaves
 * a gap for every fractional percentage: 90.7% belongs to neither. Matching on
 * the LOWER bound only closes every gap, so no report card can ever print a
 * blank grade for a real mark.
 */
export function gradeFor(bp: number, bands: GradeBand[] = CBSE_8_POINT): GradeBand | null {
  if (bands.length === 0) return null;
  const pct = bp / 100;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => pct >= b.min) ?? sorted[sorted.length - 1];
}

export type ReportTotals = {
  totalMarks: number;
  maxMarks: number;
  percentBp: number;
  grade: string | null;
  subjectsPassed: number;
  subjectsFailed: number;
  failedSubjects: string[];
  result: "PASS" | "FAIL" | "PENDING";
  /** subjects still awaiting entry — a report card must never silently omit one */
  pending: string[];
};

export function computeReport(
  marks: SubjectMark[],
  bands: GradeBand[] = CBSE_8_POINT,
): ReportTotals {
  const pending = marks.filter((m) => m.marks == null && !m.isAbsent).map((m) => m.subject);
  const counted = marks.filter((m) => m.marks != null || m.isAbsent);

  let total = 0;
  let max = 0;
  const failed: string[] = [];

  for (const m of counted) {
    const scored = m.isAbsent ? 0 : (m.marks ?? 0);
    total += scored;
    max += m.maxMarks;
    const pass = m.passMarks ?? Math.round(m.maxMarks * 0.33);
    if (scored < pass) failed.push(m.subject);
  }

  const bp = percentBp(total, max);
  const band = max > 0 ? gradeFor(bp, bands) : null;

  return {
    totalMarks: total,
    maxMarks: max,
    percentBp: bp,
    grade: band?.grade ?? null,
    subjectsPassed: counted.length - failed.length,
    subjectsFailed: failed.length,
    failedSubjects: failed,
    result: pending.length > 0 ? "PENDING" : failed.length > 0 ? "FAIL" : "PASS",
    pending,
  };
}

/**
 * Ranks with proper ties: 95, 95, 90 → 1, 1, 3. Schools get asked about this
 * every single term, and getting it wrong is a phone call from a parent.
 */
export function rankStudents<T extends { id: string; percentBp: number }>(
  rows: T[],
): Array<T & { rank: number }> {
  const sorted = [...rows].sort((a, b) => b.percentBp - a.percentBp);
  const out: Array<T & { rank: number }> = [];
  let lastBp: number | null = null;
  let lastRank = 0;

  sorted.forEach((row, i) => {
    const rank = lastBp !== null && row.percentBp === lastBp ? lastRank : i + 1;
    out.push({ ...row, rank });
    lastBp = row.percentBp;
    lastRank = rank;
  });

  return out;
}

/** Weighted final across terms ("Term 1 30% + Term 2 70%"). */
export function weightedFinalBp(terms: Array<{ percentBp: number; weightage: number }>): number {
  const totalWeight = terms.reduce((a, t) => a + t.weightage, 0);
  if (totalWeight <= 0) return 0;
  const weighted = terms.reduce((a, t) => a + t.percentBp * t.weightage, 0);
  return Math.round(weighted / totalWeight);
}

/** HPC levels, ordered, so a progress arrow can be drawn. */
export const HPC_LEVELS = ["BEGINNER", "PROGRESSING", "PROFICIENT", "ADVANCED"] as const;
export type HpcLevel = (typeof HPC_LEVELS)[number];

export function hpcLevelIndex(level: string): number {
  return HPC_LEVELS.indexOf(level as HpcLevel);
}

/** Consolidate multi-rater HPC entries into one level per competency. */
export function consolidateHpc(
  entries: Array<{ domain: string; competency: string; rater: string; level: string }>,
): Array<{ domain: string; competency: string; level: HpcLevel; raters: string[] }> {
  const byKey = new Map<string, { domain: string; competency: string; levels: number[]; raters: string[] }>();

  for (const e of entries) {
    const key = `${e.domain}::${e.competency}`;
    const idx = hpcLevelIndex(e.level);
    if (idx < 0) continue;
    const row = byKey.get(key) ?? { domain: e.domain, competency: e.competency, levels: [], raters: [] };
    row.levels.push(idx);
    if (!row.raters.includes(e.rater)) row.raters.push(e.rater);
    byKey.set(key, row);
  }

  return [...byKey.values()].map((r) => ({
    domain: r.domain,
    competency: r.competency,
    // Teacher-weighted would need rater weights; the mean is honest and explainable.
    level: HPC_LEVELS[Math.round(r.levels.reduce((a, b) => a + b, 0) / r.levels.length)],
    raters: r.raters,
  }));
}
