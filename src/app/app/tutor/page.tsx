import { requireRole, OFFICE, currentSchool } from "@/lib/session";
import { db } from "@/lib/db";
import { classOrderFor } from "@/lib/core/setup-core";
import { tutorClassLevelOf } from "@/lib/core/tutor-core";
import { tutorOn, tutorSeats } from "@/lib/queries/tutor";
import { tutorUnavailableMessage } from "@/lib/tutor/client";
import { Card, CardHead, Empty, PageHead, Stat } from "@/components/ui/primitives";
import { RosterPanel, type ClassRow } from "./roster-panel";

export const metadata = { title: "AI Tutor — Flanca" };

/**
 * The school's view of the tutor it bought.
 *
 * This page exists because the seam had a working tutor side and no school side
 * at all: the roster endpoint, the handoff and the read-back were all built and
 * there was no button in Flanca that called any of them. A capability nobody in
 * the office can reach is not a feature.
 *
 * It is deliberately an office page and not a settings page. Giving a child an
 * account on a system that watches how they learn is an administrative act with
 * a person's name against it, not a configuration toggle.
 */
export default async function TutorPage() {
  const actor = await requireRole(...OFFICE);
  const school = await currentSchool(actor.schoolId);

  if (!tutorOn()) {
    return (
      <>
        <PageHead title="AI Tutor" sub={school.name} />
        <Card>
          <Empty
            title="This school does not have the tutor"
            hint="The tutor is a separate product and a separate purchase. Flanca is complete without it — nothing on any other screen depends on it."
          />
        </Card>
      </>
    );
  }

  const seats = await tutorSeats();

  const classes = await db.class.findMany({
    where: { schoolId: actor.schoolId },
    select: {
      id: true,
      name: true,
      _count: { select: { students: { where: { status: "ACTIVE" } } } },
    },
  });

  const held = new Map<string, number>();
  if (seats.state === "ok") {
    for (const row of seats.data.byClass ?? []) {
      if (row.classLevel) held.set(row.classLevel, row.students);
    }
  }

  const rows: ClassRow[] = classes
    .map((c) => {
      const level = tutorClassLevelOf(c.name);
      return {
        id: c.id,
        name: c.name,
        active: c._count.students,
        classLevel: level,
        held: level ? (held.get(level) ?? 0) : 0,
      };
    })
    .sort((a, b) => classOrderFor(a.name) - classOrderFor(b.name));

  const taught = rows.filter((r) => r.classLevel !== null);
  const outside = rows.filter((r) => r.classLevel === null);
  const unreachable = tutorUnavailableMessage(seats);

  return (
    <>
      <PageHead
        eyebrow="Two products, one door"
        title="AI Tutor"
        sub={seats.state === "ok" ? `${seats.data.school} · ${seats.data.status}` : school.name}
      />

      {unreachable ? (
        <Card className="mb-5">
          <p className="text-[13.5px] leading-relaxed text-ink-3">{unreachable}</p>
        </Card>
      ) : null}

      {seats.state === "ok" ? (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Accounts" value={String(seats.data.seatsUsed)} sub="children with a tutor login" />
          <Stat
            label="Seats bought"
            value={seats.data.seatCap === null ? "No cap" : String(seats.data.seatCap)}
            sub={seats.data.seatCap === null ? "unlimited on this plan" : "on this plan"}
          />
          <Stat
            label="Free"
            value={seats.data.seatsFree === null ? "—" : String(seats.data.seatsFree)}
            tone={seats.data.seatsFree !== null && seats.data.seatsFree === 0 ? "bad" : "good"}
            sub="seats still to fill"
          />
          <Stat
            label="Taught here"
            value={`${taught.reduce((n, r) => n + r.active, 0)}`}
            sub={`Class 3–12 · ${outside.length} classes below that`}
          />
        </div>
      ) : null}

      <RosterPanel rows={taught} reachable={seats.state === "ok"} />

      {outside.length > 0 ? (
        <Card className="mt-5">
          <CardHead
            title="Classes the tutor does not teach"
            hint="The tutor covers Class 3 to Class 12. These children stay in Flanca exactly as they are — nothing is sent, and nothing is missing."
          />
          <p className="px-4 pb-4 text-[13.5px] text-ink-3">
            {outside.map((r) => `${r.name} (${r.active})`).join(" · ")}
          </p>
        </Card>
      ) : null}
    </>
  );
}
