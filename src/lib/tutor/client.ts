/**
 * The only place Flanca talks to the tutor.
 *
 * ── THIS FILE IS WHERE "TWO EYES" IS EITHER TRUE OR JUST A COMMENT ──────────
 *
 * The rule is that either product works alone. In practice that comes down to
 * one thing: a page in Flanca must render when the tutor is switched off,
 * unreachable, slow, or was never bought. Not "render an error" — render, with
 * one panel absent and everything else exactly as it was.
 *
 * Three deliberate choices make that hold rather than hope for it.
 *
 * 1. NOTHING HERE THROWS. Every function returns a `TutorResult`, and the
 *    failure states are values a caller has to look at. A `T | null` would let a
 *    caller write `data?.students` and quietly show an empty class list, which is
 *    worse than showing nothing — an empty list reads as "no children are using
 *    it" and someone acts on that.
 *
 * 2. A SHORT TIMEOUT, ALWAYS. A dark tutor that accepts a connection and never
 *    answers is more dangerous than one that refuses, because it holds a server
 *    render open. Reads get 2.5s: past that, the panel is not worth the page.
 *
 * 3. NOT CONFIGURED IS NOT AN ERROR. A school that has not bought the tutor is
 *    the normal case, and it is `state: "off"` — distinct from "configured and
 *    broken", because the first should say nothing to the user and the second
 *    should say something to us.
 */

export type TutorResult<T> =
  /** The tutor answered. */
  | { state: "ok"; data: T }
  /** Not configured. The school does not have the tutor. Say nothing. */
  | { state: "off" }
  /** Configured, but did not answer in time or at all. */
  | { state: "unreachable"; detail: string }
  /** Answered with a refusal — bad key, suspended school, unknown student. */
  | { state: "refused"; status: number; detail: string };

export interface TutorConfig {
  baseUrl: string;
  /** This school's id as the tutor knows it. */
  orgRef: string;
  key: string;
}

/** Null when the tutor is not configured, which is a normal state. */
export function tutorConfig(): TutorConfig | null {
  const baseUrl = process.env.TUTOR_API_URL?.replace(/\/$/, "");
  const orgRef = process.env.TUTOR_ORG_REF;
  const key = process.env.TUTOR_ORG_KEY;
  if (!baseUrl || !orgRef || !key) return null;
  return { baseUrl, orgRef, key };
}

export const READ_TIMEOUT_MS = 2_500;
/** A roster of six hundred children is a different kind of wait to a panel. */
export const WRITE_TIMEOUT_MS = 15_000;

type Fetcher = typeof fetch;

/**
 * One request, with every failure turned into a value.
 *
 * `fetchImpl` is injectable purely so the degradation paths can be tested
 * without a network — checkpoint 1 of the integrity checklist is "point Flanca
 * at a dead tutor and every screen still renders", and that deserves a test
 * rather than a manual poke.
 */
async function call<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number },
  fetchImpl: Fetcher = fetch,
): Promise<TutorResult<T>> {
  const config = tutorConfig();
  if (!config) return { state: "off" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? READ_TIMEOUT_MS);

  try {
    const response = await fetchImpl(`${config.baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        // Never logged, never surfaced, never put in a URL.
        "X-Org-Key": config.key,
        ...init.headers,
      },
    });

    if (!response.ok) {
      // A refusal is information: a wrong key or a suspended school is something
      // the office should be told, unlike a timeout which is ours to fix.
      let detail = `${response.status}`;
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body?.error === "string") detail = body.error;
      } catch {
        // A non-JSON error body is still a refusal; the status carries it.
      }
      return { state: "refused", status: response.status, detail };
    }

    return { state: "ok", data: (await response.json()) as T };
  } catch (err) {
    /*
     * Everything lands here: DNS failure, connection refused, TLS error, the
     * abort above, a malformed JSON body. They are one state on purpose — a page
     * cannot do anything different about them, and a caller offered five
     * varieties of "not now" will handle one and forget the rest.
     */
    const detail = err instanceof Error ? (err.name === "AbortError" ? `no answer in ${init.timeoutMs ?? READ_TIMEOUT_MS}ms` : err.message) : "unknown";
    return { state: "unreachable", detail };
  } finally {
    clearTimeout(timeout);
  }
}

/* ─────────────────────────── the reads ─────────────────────────── */

export interface CohortStudent {
  admissionNumber: string | null;
  name: string;
  classLevel: string | null;
  coverage: number;
  mastery: number | null;
  caveat: string | null;
  repeatedMistakes: { topic: string; mistakeType: string; occurrences: number }[];
  chaptersStarted: number;
  lastActive: string | null;
}

export interface Cohort {
  school: string;
  classLevel: string | null;
  students: CohortStudent[];
  topicsInScope: number;
}

/**
 * A class, as the tutor sees it.
 *
 * The order comes from the tutor and is deliberate — lowest coverage first,
 * never by score. **Do not re-sort this on arrival.** A class list ordered
 * best-to-worst is a leaderboard, and the tutor refuses to produce one; sorting
 * it here would undo that decision from the other side of the seam.
 */
export async function fetchCohort(
  params: { classLevel?: string | null; subject?: string | null },
  fetchImpl?: Fetcher,
): Promise<TutorResult<Cohort>> {
  const config = tutorConfig();
  if (!config) return { state: "off" };

  const query = new URLSearchParams({ externalRef: config.orgRef });
  if (params.classLevel) query.set("classLevel", params.classLevel);
  if (params.subject) query.set("subject", params.subject);

  return call<Cohort>(`/organisations/cohort?${query}`, { method: "GET", cache: "no-store" }, fetchImpl);
}

export async function fetchStudent(
  admissionNumber: string,
  params: { subject?: string | null } = {},
  fetchImpl?: Fetcher,
): Promise<TutorResult<{ school: string; student: CohortStudent }>> {
  const config = tutorConfig();
  if (!config) return { state: "off" };

  const query = new URLSearchParams({ externalRef: config.orgRef });
  if (params.subject) query.set("subject", params.subject);

  return call(`/organisations/student/${encodeURIComponent(admissionNumber)}?${query}`, { method: "GET", cache: "no-store" }, fetchImpl);
}

export interface Seats {
  school: string;
  status: string;
  planId: string | null;
  seatsUsed: number;
  seatCap: number | null;
  seatsFree: number | null;
  /**
   * Per class, as the tutor names them ("7"). The office page needs it to say
   * "Class 7: 38 of 40 have an account" without a second request per class.
   */
  byClass: { classLevel: string | null; students: number }[];
}

export async function fetchSeats(fetchImpl?: Fetcher): Promise<TutorResult<Seats>> {
  const config = tutorConfig();
  if (!config) return { state: "off" };
  return call<Seats>(`/organisations/seats?externalRef=${encodeURIComponent(config.orgRef)}`, { method: "GET", cache: "no-store" }, fetchImpl);
}

/* ─────────────────────────── the writes ─────────────────────────── */

export interface RosterEntry {
  admissionNumber: string;
  name: string;
  className: string | null;
  section?: string | null;
  email?: string | null;
  withdrawn?: boolean;
}

export interface RosterOutcome {
  school: string;
  created: number;
  updated: number;
  withdrawn: number;
  seatsUsed: number;
  seatCap: number | null;
  skipped: { admissionNumber: string; reason?: string }[];
  note?: string;
}

export interface RosterPreview {
  dryRun: true;
  school: string;
  counts: { create: number; update: number; withdraw: number; skip: number };
  decisions: { admissionNumber: string; action: string; reason?: string; classLevel?: string }[];
}

export async function pushRoster(
  students: RosterEntry[],
  opts: { dryRun?: boolean } = {},
  fetchImpl?: Fetcher,
): Promise<TutorResult<RosterOutcome | RosterPreview>> {
  const config = tutorConfig();
  if (!config) return { state: "off" };

  return call(
    "/organisations/roster",
    {
      method: "POST",
      cache: "no-store",
      timeoutMs: WRITE_TIMEOUT_MS,
      body: JSON.stringify({ externalRef: config.orgRef, dryRun: opts.dryRun ?? false, students }),
    },
    fetchImpl,
  );
}

/**
 * A one-click way in for one child.
 *
 * The URL is single use and lives about a minute, so it is fetched at the moment
 * of the click and redirected to immediately — never stored, never put in a
 * page's HTML, never emailed.
 */
export async function mintHandoffUrl(
  admissionNumber: string,
  fetchImpl?: Fetcher,
): Promise<TutorResult<{ url: string; expiresAt: string; student: { name: string | null } }>> {
  const config = tutorConfig();
  if (!config) return { state: "off" };

  return call(
    "/organisations/handoff",
    {
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({ externalRef: config.orgRef, admissionNumber }),
    },
    fetchImpl,
  );
}

/* ─────────────────────────── saying so to a person ─────────────────────── */

/**
 * What a screen shows when the tutor did not answer.
 *
 * One sentence, honest, and never an empty state pretending to be data. The
 * distinction that matters: "off" means say nothing at all, because a school
 * without the tutor should not see a hole where a feature they have not bought
 * would go.
 */
export function tutorUnavailableMessage(result: TutorResult<unknown>): string | null {
  switch (result.state) {
    case "ok":
      return null;
    case "off":
      return null;
    case "unreachable":
      return "The tutor is not responding just now. Everything else here is unaffected — try again in a minute.";
    case "refused":
      /*
       * 404 is not an error worth alarming anybody with: it means this child has
       * no tutor account yet, which is the normal state for every class the
       * office has not sent. Saying "the tutor refused that request" for a
       * situation fixed by one click in /app/tutor sends a parent to the office
       * with the wrong question.
       *
       * 403 carries its own reason — a suspended school says so in words — and
       * anything else is genuinely ours to look at.
       */
      if (result.status === 404) {
        return "There is no tutor account for this child yet. The office can create one from the AI Tutor page.";
      }
      return result.status === 403
        ? result.detail
        : "The tutor refused that request. The office may need to check the school's tutor subscription.";
  }
}
