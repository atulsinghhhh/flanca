/**
 * The school's half of the seam, as pure rules.
 *
 * Flanca decides three things about the tutor and they all live here, away from
 * any database or fetch call, because each one is a rule somebody will want to
 * change later and none of them should be re-derived in a page:
 *
 *   1. WHICH children are sent, and which are explicitly taken off.
 *   2. WHAT a member of staff is allowed to see of what comes back.
 *   3. HOW a number that the tutor withheld is displayed — which is: not.
 *
 * The tutor enforces its own versions of (1) and (3) on its own side. That is
 * not duplication to be tidied away: the two products keep separate databases,
 * and each has to be right when the other is dark.
 */

import { parseClassAndSection } from "./setup-core";

/**
 * The class as the tutor names it: a bare number, and only 3 to 12.
 *
 * Built on Flanca's own class parser rather than a third copy of it, so "VII",
 * "Class 7", "7 B" and "7th" all agree with what the roster importer already
 * decided they meant. `null` means the tutor does not teach this class — a real
 * answer for Nursery to Class 2, which a school of six hundred certainly has, and
 * one worth saying on screen instead of showing an empty panel.
 */
export function tutorClassLevelOf(className: string | null | undefined): string | null {
  if (!className) return null;
  const parsed = parseClassAndSection(className);
  if (!parsed.className) return null;
  const n = Number(parsed.className.replace(/\D/g, ""));
  if (!Number.isFinite(n) || n < 3 || n > 12) return null;
  return String(n);
}

/** A Flanca student, reduced to what the roster cares about. */
export interface RosterSourceStudent {
  admissionNumber: string;
  name: string;
  /** As the school writes it — "Class 5", "V", "10". */
  className: string | null;
  section: string | null;
  /** ACTIVE | ALUMNI | TRANSFERRED | DROPPED */
  status: string;
}

/** One line of what we send. Shaped by the tutor's roster endpoint. */
export interface RosterLine {
  admissionNumber: string;
  name: string;
  className: string | null;
  section: string | null;
  /**
   * Always absent, and that is a decision — see `rosterFor`.
   */
  email?: null;
  /** Only ever `true`, and only ever set deliberately. */
  withdrawn?: true;
}

export interface RosterIntent {
  lines: RosterLine[];
  /** What this push will ask for, in words, before it is sent. */
  counts: { send: number; withdraw: number; ignored: number };
  /**
   * Children who have left and whom the tutor has never heard of. Nothing is
   * sent for them, and saying so stops a clerk wondering where they went.
   */
  ignored: string[];
}

/**
 * Build the roster to send for one scope — a class, or the whole school.
 *
 * Three rules, in the order they matter:
 *
 * **Absence never withdraws anybody.** A push of Class 7 must not switch off
 * Class 8. So withdrawal is stated explicitly, per child, and only ever for a
 * child inside the scope being pushed. The tutor refuses to infer removal from a
 * short file; this side refuses to produce one that could be misread as removal.
 *
 * **We never send an address.** Flanca holds `guardianEmail` — a parent's
 * address, and routinely the *same* address for two siblings. The tutor keys
 * account identity on email, so sending it would (a) put a child's learning
 * account behind a parent's mailbox and (b) collide the second sibling against a
 * unique index *inside the roster transaction*, failing the whole upload for
 * everybody. The tutor builds its own unresolvable `.invalid` address instead.
 * Leaving `email` out is therefore load-bearing, not laziness.
 *
 * **A child who has left is withdrawn, not deleted.** Withdrawal detaches them
 * from the school and keeps what they learned. Erasure is a different act with a
 * different authority behind it, and it is not this.
 */
export function rosterFor(params: {
  students: RosterSourceStudent[];
  /** Admission numbers the tutor already holds for this school. */
  known: ReadonlySet<string>;
}): RosterIntent {
  const lines: RosterLine[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();

  for (const s of params.students) {
    const ref = s.admissionNumber.trim();
    if (ref === "" || seen.has(ref)) continue;
    seen.add(ref);

    if (s.status === "ACTIVE") {
      lines.push({
        admissionNumber: ref,
        name: s.name.trim(),
        className: s.className,
        section: s.section,
      });
      continue;
    }

    // Left the school. Only worth a line if the tutor has an account to detach.
    if (params.known.has(ref)) {
      lines.push({ admissionNumber: ref, name: s.name.trim(), className: s.className, section: s.section, withdrawn: true });
    } else {
      ignored.push(ref);
    }
  }

  const withdraw = lines.filter((l) => l.withdrawn).length;
  return {
    lines,
    counts: { send: lines.length - withdraw, withdraw, ignored: ignored.length },
    ignored,
  };
}

/* ─────────────────────── what comes back, and who sees it ─────────────── */

/** One child as the tutor describes them. Mirrors the tutor's cohort row. */
export interface TutorChild {
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

/**
 * Narrow a class to one teacher's section.
 *
 * The tutor knows classes, not sections — it has no idea that 7 A and 7 B are
 * different rooms with different teachers. So a class teacher's panel is filtered
 * here, by the admission numbers of her own section.
 *
 * **The order is not touched.** The tutor returns lowest coverage first and
 * refuses to sort by score; re-sorting on arrival would undo that decision from
 * the other side of the seam, which is exactly the sort of thing that happens by
 * accident when a component "just needs" a leaderboard.
 */
export function onlyThese(children: TutorChild[], allowed: ReadonlySet<string>): TutorChild[] {
  return children.filter((c) => c.admissionNumber !== null && allowed.has(c.admissionNumber));
}

/**
 * The one honest headline for a class.
 *
 * Deliberately not an average of anything. In a school's first months almost
 * every mastery figure is withheld for thin coverage, so a panel that leads with
 * an average leads with a blank — while the two facts a teacher can act on are
 * available from day one: how many children have not started, and how many have
 * a mistake that keeps repeating.
 */
export function cohortHeadline(children: TutorChild[]): {
  total: number;
  notStarted: number;
  started: number;
  withPatterns: number;
} {
  let notStarted = 0;
  let withPatterns = 0;
  for (const c of children) {
    if (c.chaptersStarted === 0 && c.coverage === 0) notStarted++;
    if (c.repeatedMistakes.length > 0) withPatterns++;
  }
  return { total: children.length, notStarted, started: children.length - notStarted, withPatterns };
}

/** Coverage as a whole number, for a page. 0.134 → 13. */
export function coveragePercent(coverage: number): number {
  return Math.round(Math.max(0, Math.min(1, coverage)) * 100);
}

/**
 * What to print where a mastery figure would go.
 *
 * When the tutor withholds the number, the caveat *replaces* it. It is never
 * shown underneath one, because a caveat under a big number reads as modesty and
 * the number is what gets remembered — and a parent who remembers "24%" will act
 * on it whatever the small print said.
 */
export function masteryDisplay(child: TutorChild): { value: string | null; note: string | null } {
  if (child.mastery === null) return { value: null, note: child.caveat ?? "Not enough covered yet to say." };
  return { value: `${Math.round(child.mastery * 100)}%`, note: child.caveat };
}

/** "sign errors in Integers, 4 times" — a mistake, in a sentence. */
export function mistakeLine(m: { topic: string; mistakeType: string; occurrences: number }): string {
  const kind = m.mistakeType.replace(/_/g, " ");
  return `${kind} in ${m.topic}, ${m.occurrences} times`;
}

/**
 * Has this child ever actually used it?
 *
 * Used to decide between "nothing yet" and a panel of numbers. A provisioned
 * account that has never been opened is the normal state for most of a school in
 * week one, and saying "no activity yet" is honest where a row of zeroes reads
 * like a judgement.
 */
export function hasActivity(child: TutorChild): boolean {
  return child.chaptersStarted > 0 || child.coverage > 0 || child.repeatedMistakes.length > 0;
}
