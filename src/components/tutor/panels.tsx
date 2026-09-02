import Link from "next/link";
import {
  coveragePercent,
  hasActivity,
  masteryDisplay,
  mistakeLine,
  type TutorChild,
} from "@/lib/core/tutor-core";
import { childForParent, childForSchool, sectionCohort, tutorOn } from "@/lib/queries/tutor";
import { tutorUnavailableMessage, type TutorResult } from "@/lib/tutor/client";
import { Badge, Card, CardHead, Meter } from "@/components/ui/primitives";
import { EnterTutorButton } from "./enter-button";

/**
 * What the school sees of the tutor, on the school's own screens.
 *
 * Every component in this file obeys the same two rules, and they are the reason
 * the file exists rather than the panels being inlined where they are used:
 *
 *   1. WHEN THE TUTOR IS OFF, RENDER NOTHING. Not an empty card, not a greyed
 *      box — nothing at all. A school that has not bought the tutor must not see
 *      a hole on their teacher's home page shaped like something withheld.
 *
 *   2. WHEN THE TUTOR IS DARK, SAY SO IN ONE SENTENCE AND STOP. The rest of the
 *      page is unaffected, because nothing else on it came from here.
 *
 * A withheld mastery figure is never replaced by a zero, an average, or a
 * "0% covered" bar that reads as failure. Coverage is shown because it is a fact;
 * mastery is shown only when the tutor was willing to stand behind it.
 */

function Unavailable({ result }: { result: TutorResult<unknown> }) {
  const said = tutorUnavailableMessage(result);
  if (!said) return null;
  return <p className="px-5 py-4 text-[13px] leading-relaxed text-ink-3">{said}</p>;
}

/* ─────────────────────── a class teacher's section ─────────────────────── */

/**
 * Her section, lowest coverage first, from data she never entered.
 *
 * The order arrives from the tutor and is left exactly as it came: lowest
 * coverage first, never by score. A teacher's class list sorted best-to-worst is
 * a leaderboard whatever it is called, and this is the one place it would be
 * easiest to accidentally create one.
 */
export async function TutorSectionPanel({
  schoolId,
  sectionId,
}: {
  schoolId: string;
  sectionId: string;
}) {
  if (!tutorOn()) return null;

  const { result, children, className, taught } = await sectionCohort({ schoolId, sectionId });
  if (!taught) return null;

  return (
    <Card className="mt-5">
      <CardHead
        title={`${className} on the tutor`}
        hint="Who has engaged, and what keeps going wrong. Ordered by least covered first — not by marks."
      />

      {result.state !== "ok" ? <Unavailable result={result} /> : null}

      {result.state === "ok" && children.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-ink-3">
          None of this section has a tutor account yet. The office can give them one.
        </p>
      ) : null}

      {result.state === "ok" && children.length > 0 ? (
        <ul className="divide-y divide-line">
          {children.map((c) => {
            const shown = masteryDisplay(c);
            return (
              <li key={c.admissionNumber} className="px-5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-[14px] font-medium">{c.name}</p>
                  <div className="flex items-center gap-2">
                    {hasActivity(c) ? (
                      <span className="text-[12.5px] text-ink-3 tnum">
                        {coveragePercent(c.coverage)}% covered
                      </span>
                    ) : (
                      <Badge>not started</Badge>
                    )}
                    {shown.value ? <Badge tone="good">{shown.value}</Badge> : null}
                  </div>
                </div>

                {hasActivity(c) ? (
                  <Meter valueBp={coveragePercent(c.coverage) * 100} className="mt-2" />
                ) : null}

                {c.repeatedMistakes.length > 0 ? (
                  <ul className="mt-2 space-y-0.5 text-[12.5px] text-ink-2">
                    {c.repeatedMistakes.map((m) => (
                      <li key={`${m.topic}-${m.mistakeType}`}>· {mistakeLine(m)}</li>
                    ))}
                  </ul>
                ) : null}

                {!shown.value && shown.note && hasActivity(c) ? (
                  <p className="mt-1.5 text-[12px] text-ink-3">{shown.note}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}

/* ─────────────────────── one child ─────────────────────── */

function ChildBody({ child, name }: { child: TutorChild; name: string }) {
  const shown = masteryDisplay(child);

  if (!hasActivity(child)) {
    return (
      <p className="px-5 py-4 text-[13px] leading-relaxed text-ink-3">
        {name.split(" ")[0]} has a tutor account and has not used it yet. Nothing is wrong — there is
        simply nothing to report.
      </p>
    );
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[13.5px] text-ink-2">
          <span className="tnum font-semibold">{coveragePercent(child.coverage)}%</span> of the
          year&rsquo;s topics touched
        </p>
        {shown.value ? <Badge tone="good">Mastery {shown.value}</Badge> : null}
        {child.chaptersStarted > 0 ? (
          <span className="text-[12.5px] text-ink-3">{child.chaptersStarted} chapters started</span>
        ) : null}
      </div>

      <Meter valueBp={coveragePercent(child.coverage) * 100} className="mt-2.5" />

      {shown.note ? <p className="mt-2 text-[12.5px] leading-snug text-ink-3">{shown.note}</p> : null}

      {child.repeatedMistakes.length > 0 ? (
        <>
          <p className="mt-3.5 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
            What keeps going wrong
          </p>
          <ul className="mt-1 space-y-0.5 text-[13px] text-ink-2">
            {child.repeatedMistakes.map((m) => (
              <li key={`${m.topic}-${m.mistakeType}`}>· {mistakeLine(m)}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/**
 * A parent's own child, and nobody else's.
 *
 * The link is checked in `childForParent` before the tutor is asked anything.
 * When there is no link this renders nothing at all rather than "not permitted",
 * which would confirm that the admission number exists.
 */
export async function TutorParentPanel({
  schoolId,
  parentUserId,
  studentId,
}: {
  schoolId: string;
  parentUserId: string;
  studentId: string;
}) {
  if (!tutorOn()) return null;

  const found = await childForParent({ schoolId, parentUserId, studentId });
  if (!found) return null;

  return (
    <Card className="mt-3">
      <CardHead
        title="On the tutor"
        hint="What your child has worked through, and the mistakes that keep coming back. Not what they typed or asked."
        action={<EnterTutorButton studentId={studentId} label="Open the tutor" />}
      />
      {found.result.state === "ok" ? (
        <ChildBody child={found.result.data.student} name={found.name} />
      ) : (
        <Unavailable result={found.result} />
      )}
    </Card>
  );
}

/**
 * The same child, for the office or the class teacher, on the student profile.
 *
 * Identical content on purpose. A school that is shown one thing and a parent
 * another has to remember which is which, and one of the two will be the version
 * that gets quoted in a meeting.
 */
export async function TutorProfilePanel({
  schoolId,
  studentId,
}: {
  schoolId: string;
  studentId: string;
}) {
  if (!tutorOn()) return null;

  const found = await childForSchool({ schoolId, studentId });
  if (!found) return null;

  return (
    <Card className="mt-4">
      <CardHead
        title="AI Tutor"
        hint="Coverage and repeated mistakes. Deliberately not what the child said to it."
        action={<EnterTutorButton studentId={studentId} label="Open" variant="quiet" />}
      />
      {found.result.state === "ok" ? (
        <ChildBody child={found.result.data.student} name={found.name} />
      ) : (
        <Unavailable result={found.result} />
      )}
    </Card>
  );
}

/* ─────────────────────── a student's own way in ─────────────────────── */

/**
 * The student's own door, on their own home page.
 *
 * No numbers here, deliberately. A child does not need their coverage percentage
 * on the school portal — they need the way in. The tutor's own screens are where
 * their progress belongs, and it says it better there.
 */
export async function TutorStudentEntry({ studentId }: { studentId: string }) {
  if (!tutorOn()) return null;

  return (
    <Card className="mt-5">
      <CardHead
        title="Your tutor"
        hint="Ask it anything from today's lessons. Photograph your working and it will tell you which line went wrong."
        action={<EnterTutorButton studentId={studentId} label="Open the tutor" variant="primary" />}
      />
      <p className="px-5 py-3.5 text-[13px] leading-relaxed text-ink-3">
        You are already signed in — there is no second password.{" "}
        <Link href="/app" className="underline">
          Everything else here
        </Link>{" "}
        works whether or not you use it.
      </p>
    </Card>
  );
}
