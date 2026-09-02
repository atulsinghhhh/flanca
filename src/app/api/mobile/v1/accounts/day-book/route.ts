import { requireMobileRole, MONEY } from "@/lib/mobile/session";
import { getDayBook } from "@/lib/queries/fees";
import { resolveDay } from "@/lib/queries/when";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/** Today at the counter: what came in, by whom, in what form. Mirrors getDayBook. */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...MONEY);
  const date = resolveDay(new URL(req.url).searchParams.get("date") ?? undefined);

  const dayBook = await getDayBook(actor.schoolId, date);
  return apiOk({ dayBook });
});
