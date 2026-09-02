import { z } from "zod";
import { audit } from "@/lib/session";
import { mintHandoffUrl, tutorUnavailableMessage } from "@/lib/tutor/client";
import { admissionNumberForEntry } from "@/lib/queries/tutor";
import { requireMobileActor } from "@/lib/mobile/session";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

const Body = z.object({ studentId: z.string().min(1) });

/**
 * The mobile twin of src/app/app/tutor/enter-action.ts::enterTutor — one
 * click into the tutor, already signed in. Same rule, same authority check
 * (`admissionNumberForEntry`: the child, a linked parent, that section's
 * class teacher, or the office), just `requireMobileActor` in place of the
 * cookie-based `requireActor` this stateless route cannot use.
 *
 * The minted URL is single-use and lives about a minute — the Flutter client
 * should fetch it and navigate immediately, never cache it.
 */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);
  const { studentId } = Body.parse(await req.json());

  const who = await admissionNumberForEntry({
    schoolId: actor.schoolId,
    actorId: actor.id,
    roles: actor.roles,
    studentId,
  });
  if (!who) return apiError(403, "not_permitted", "That is not a child you can open the tutor for.");

  const minted = await mintHandoffUrl(who.admissionNumber);
  if (minted.state !== "ok") {
    return apiError(
      502,
      "tutor_unavailable",
      tutorUnavailableMessage(minted) ?? "The tutor is not set up for this school.",
    );
  }

  // Audited without the code — see enter-action.ts for why: the credential is
  // single-use and this is the one place it would outlive the click.
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "tutor.entry.open",
    entity: "Student",
    entityId: studentId,
    summary: `Opened the tutor for ${who.name}`,
  });

  return apiOk({ url: minted.data.url });
});
