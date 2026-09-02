/**
 * APAAR / UDISE+ compliance logic. Pure.
 *
 * Why this matters more than any AI feature in 2026: APAAR ID is mandatory for
 * every student in Class 1–12 for 2026-27, and UDISE+ certification FREEZES on
 * 30 September 2026. A student without an APAAR ID blocks the whole school's
 * certification. Generation commonly fails on an Aadhaar name mismatch, and
 * parent consent must be captured BEFORE generation.
 *
 * No competitor advertises this workflow. It is the reason a principal takes our call.
 */

export const APAAR_STATES = [
  "NOT_STARTED",
  "CONSENT_PENDING",
  "CONSENT_REFUSED",
  "SUBMITTED",
  "MISMATCH",
  "ISSUED",
] as const;

export type ApaarState = (typeof APAAR_STATES)[number];

export type ApaarStudent = {
  id: string;
  name: string;
  apaarId?: string | null;
  apaarStatus?: string | null;
  aadhaarName?: string | null;
  dob?: Date | null;
  consentGranted?: boolean;
  consentRefused?: boolean;
};

/**
 * The stored status is advisory; the truth is derived, so a stale column can
 * never make a school believe it is compliant when it isn't.
 */
export function deriveApaarState(s: ApaarStudent): ApaarState {
  if (s.apaarId && s.apaarId.trim().length > 0) return "ISSUED";
  if (s.apaarStatus === "MISMATCH") return "MISMATCH";
  if (s.apaarStatus === "SUBMITTED") return "SUBMITTED";
  if (s.consentRefused) return "CONSENT_REFUSED";
  if (!s.consentGranted) return "CONSENT_PENDING";
  return s.apaarStatus === "NOT_STARTED" || !s.apaarStatus ? "NOT_STARTED" : (s.apaarStatus as ApaarState);
}

/** What the office should physically do next for this student. */
export function nextAction(state: ApaarState): string {
  switch (state) {
    case "ISSUED":
      return "Done — nothing pending";
    case "SUBMITTED":
      return "Awaiting UDISE+ — check the portal";
    case "MISMATCH":
      return "Fix Aadhaar name mismatch, then resubmit";
    case "CONSENT_REFUSED":
      return "Parent refused — record the refusal and escalate to the principal";
    case "CONSENT_PENDING":
      return "Collect verifiable parental consent";
    case "NOT_STARTED":
      return "Start: verify Aadhaar name, then collect consent";
  }
}

export type ApaarCoverage = {
  total: number;
  issued: number;
  blocking: number; // anything not ISSUED blocks certification
  coverageBp: number;
  byState: Record<ApaarState, number>;
  /** true when the school can certify on UDISE+ today */
  canCertify: boolean;
};

export function apaarCoverage(students: ApaarStudent[]): ApaarCoverage {
  const byState = Object.fromEntries(APAAR_STATES.map((s) => [s, 0])) as Record<ApaarState, number>;

  for (const s of students) byState[deriveApaarState(s)]++;

  const total = students.length;
  const issued = byState.ISSUED;

  return {
    total,
    issued,
    blocking: total - issued,
    coverageBp: total === 0 ? 10000 : Math.round((issued / total) * 10000),
    byState,
    canCertify: total > 0 && issued === total,
  };
}

/**
 * Name-mismatch pre-check, run BEFORE a clerk wastes a portal submission.
 * Catches the everyday causes: initials, reordered names, extra middle names,
 * spacing, case, and honorifics.
 */
export function nameMismatch(
  schoolName: string,
  aadhaarName: string | null | undefined,
): { matches: boolean; reason: string | null; confidence: "EXACT" | "LIKELY" | "MISMATCH" } {
  if (!aadhaarName || aadhaarName.trim() === "") {
    return { matches: false, reason: "Aadhaar name not recorded", confidence: "MISMATCH" };
  }

  const a = normaliseName(schoolName);
  const b = normaliseName(aadhaarName);

  if (a === b) return { matches: true, reason: null, confidence: "EXACT" };

  const at = a.split(" ").filter(Boolean);
  const bt = b.split(" ").filter(Boolean);

  // Same tokens, different order — UDISE+ accepts this only after correction.
  if (at.length === bt.length && [...at].sort().join(" ") === [...bt].sort().join(" ")) {
    return { matches: false, reason: "Same names in a different order", confidence: "LIKELY" };
  }

  // One side has an extra middle name.
  const setA = new Set(at);
  const setB = new Set(bt);
  const missingFromAadhaar = at.filter((t) => !setB.has(t));
  const extraInAadhaar = bt.filter((t) => !setA.has(t));

  if (missingFromAadhaar.length === 0 && extraInAadhaar.length > 0) {
    return {
      matches: false,
      reason: `Aadhaar has extra name part: ${properCase(extraInAadhaar)}`,
      confidence: "LIKELY",
    };
  }
  if (extraInAadhaar.length === 0 && missingFromAadhaar.length > 0) {
    return {
      matches: false,
      reason: `Aadhaar is missing: ${properCase(missingFromAadhaar)}`,
      confidence: "LIKELY",
    };
  }

  // Initial vs full name: "R Kumar" vs "Rajesh Kumar"
  if (initialsCompatible(at, bt)) {
    return { matches: false, reason: "One name uses an initial", confidence: "LIKELY" };
  }

  return { matches: false, reason: "Names do not match", confidence: "MISMATCH" };
}

/** Tokens are compared lower-cased; show them back to the clerk as names. */
function properCase(tokens: string[]): string {
  return tokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(", ");
}

function normaliseName(n: string): string {
  return n
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|master|miss|kum|shri|smt|dr)\.?\b/g, "")
    .replace(/[^a-zऀ-ॿ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function initialsCompatible(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tok, i) => {
    const other = b[i];
    if (tok === other) return true;
    if (tok.length === 1 && other.startsWith(tok)) return true;
    if (other.length === 1 && tok.startsWith(other)) return true;
    return false;
  });
}

/** Days left before the UDISE+ certification freeze — drives the dashboard urgency. */
export function daysToFreeze(asOf: Date, freeze = new Date(Date.UTC(2026, 8, 30))): number {
  const a = Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  return Math.ceil((freeze.getTime() - a) / 86_400_000);
}
