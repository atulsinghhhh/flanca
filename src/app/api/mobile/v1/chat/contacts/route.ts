import { requireMobileActor } from "@/lib/mobile/session";
import { getChatPerson, getStartableContacts } from "@/lib/queries/chat";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/** Mirrors src/lib/queries/chat.ts::getStartableContacts — who this person may write to. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileActor(req);

  const me = await getChatPerson(actor.schoolId, actor.id);
  if (!me) return apiError(403, "forbidden", "Your account is not attached to this school.");

  const contacts = await getStartableContacts(actor.schoolId, me);
  return apiOk({ contacts });
});
