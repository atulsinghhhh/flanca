"use server";

import { audit, requireActor } from "@/lib/session";
import { mintHandoffUrl, tutorUnavailableMessage } from "@/lib/tutor/client";
import { admissionNumberForEntry } from "@/lib/queries/tutor";

/**
 * One click into the tutor, already signed in.
 *
 * The rule the whole seam was built for is that there is no second password. So
 * this mints a single-use code that lives about a minute and hands back the URL
 * for the browser to follow immediately.
 *
 * Why an action returning a URL rather than a link on the page: a link would put
 * a working credential into the HTML of every page it appears on, where it sits
 * in the DOM, in the back button, and in any screenshot the school takes for a
 * WhatsApp group. Minted at the moment of the click, it exists for the length of
 * one navigation.
 *
 * Who may ask is decided in `admissionNumberForEntry` — the child, a linked
 * parent, that section's class teacher, or the office. Every refusal looks the
 * same from here.
 */
export async function enterTutor(studentId: string): Promise<{ url: string } | { error: string }> {
  const actor = await requireActor();

  const who = await admissionNumberForEntry({
    schoolId: actor.schoolId,
    actorId: actor.id,
    roles: actor.roles,
    studentId,
  });
  if (!who) return { error: "That is not a child you can open the tutor for." };

  const minted = await mintHandoffUrl(who.admissionNumber);
  if (minted.state !== "ok") {
    return {
      error:
        tutorUnavailableMessage(minted) ??
        "The tutor is not set up for this school.",
    };
  }

  /*
   * Audited, without the code. The interesting fact is that a door was opened
   * for this child by this person at this time; the credential itself is
   * single-use and writing it to a log would be the one place it outlived the
   * click.
   */
  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "tutor.entry.open",
    entity: "Student",
    entityId: studentId,
    summary: `Opened the tutor for ${who.name}`,
  });

  return { url: minted.data.url };
}
