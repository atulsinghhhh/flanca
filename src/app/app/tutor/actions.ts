"use server";

import { revalidatePath } from "next/cache";
import { audit, requireRole, OFFICE } from "@/lib/session";
import { pushRoster, tutorUnavailableMessage, type RosterOutcome, type RosterPreview } from "@/lib/tutor/client";
import { rosterScopeFor, tutorMembership } from "@/lib/queries/tutor";

/**
 * Giving a class accounts on the tutor — previewed first, always.
 *
 * The shape is the one the student importer already taught this product and the
 * school: show what will happen, in numbers, then do it. A clerk who has been
 * shown "38 new accounts, 2 refused because they are in Class 2" before anything
 * is written is a clerk who does not phone at six because a class vanished.
 *
 * Both actions refuse outright when the tutor cannot be reached, and the refusal
 * is the interesting part. The withdrawal rule needs to know who the tutor
 * currently holds; if that read failed, an empty membership set is
 * indistinguishable from "everybody has left", and a push built on it would ask
 * for exactly the wrong thing. So no answer means no push, and it says so.
 */

async function scopeOrRefusal(classId: string | null) {
  const actor = await requireRole(...OFFICE);
  const membership = await tutorMembership();

  if (membership.result.state === "off") {
    return { error: "The tutor is not set up for this school." } as const;
  }
  if (membership.result.state !== "ok") {
    const said = tutorUnavailableMessage(membership.result);
    return {
      error: `${said ?? "The tutor did not answer."} Nothing was sent — a roster built without knowing who already has an account could withdraw children who have not left.`,
    } as const;
  }

  const scope = await rosterScopeFor({ schoolId: actor.schoolId, classId, known: membership.refs });
  return { actor, scope } as const;
}

export async function previewRoster(classId: string | null) {
  const ready = await scopeOrRefusal(classId);
  if ("error" in ready) return ready;

  const { scope } = ready;
  if (scope.intent.lines.length === 0) {
    return { error: `Nothing to send for ${scope.label.toLowerCase()} — no active students, and nobody to take off.` };
  }

  const result = await pushRoster(scope.intent.lines, { dryRun: true });
  if (result.state !== "ok") {
    return { error: tutorUnavailableMessage(result) ?? "The tutor did not answer." };
  }

  return {
    preview: result.data as RosterPreview,
    label: scope.label,
    outOfRange: scope.outOfRange,
    ignored: scope.intent.ignored,
  };
}

export async function applyRoster(classId: string | null) {
  const ready = await scopeOrRefusal(classId);
  if ("error" in ready) return ready;

  const { actor, scope } = ready;
  if (scope.intent.lines.length === 0) return { error: "Nothing to send." };

  const result = await pushRoster(scope.intent.lines, { dryRun: false });
  if (result.state !== "ok") {
    return { error: tutorUnavailableMessage(result) ?? "The tutor did not answer, and nothing was changed." };
  }

  const outcome = result.data as RosterOutcome;

  /*
   * Audited on Flanca's side, with the counts, because "who gave this child an
   * account on a system that profiles their learning" is the first question a
   * DPDP audit asks and the tutor's own log cannot answer it — it knows the
   * school's key was used, not which member of staff clicked.
   */
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "tutor.roster.push",
    entity: "TutorRoster",
    entityId: scope.classId,
    summary: `${scope.label}: ${outcome.created} tutor accounts created, ${outcome.updated} updated, ${outcome.withdrawn} withdrawn`,
    after: {
      scope: scope.label,
      created: outcome.created,
      updated: outcome.updated,
      withdrawn: outcome.withdrawn,
      skipped: outcome.skipped.length,
      seatsUsed: outcome.seatsUsed,
      seatCap: outcome.seatCap,
    },
  });

  revalidatePath("/app/tutor");
  return { outcome, label: scope.label };
}
