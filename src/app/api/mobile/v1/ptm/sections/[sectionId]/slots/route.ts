import { z } from "zod";
import { db } from "@/lib/db";
import { getChatPerson } from "@/lib/queries/chat";
import { getSlotsForSection, getBookableSlotsForSection } from "@/lib/queries/ptm";
import { resolveDay, schoolToday } from "@/lib/queries/when";
import { requireMobileActor, requireMobileRole, TEACHING } from "@/lib/mobile/session";
import { generateSlotsForActor } from "@/lib/mobile/mutations/ptm";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ sectionId: string }> };

/**
 * Mirrors src/app/app/ptm/page.tsx's reach rules for one section: a teacher
 * or the office sees every slot (getSlotsForSection); a parent sees only the
 * slots they may book for their own child (getBookableSlotsForSection).
 */
export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileActor(req);
  const { sectionId } = await params;

  const section = await db.section.findFirst({
    where: { id: sectionId, schoolId: actor.schoolId },
    select: { id: true },
  });
  if (!section) return apiError(404, "not_found", "That section is not in this school.");

  const fromParam = new URL(req.url).searchParams.get("from") ?? undefined;
  const fromDate = fromParam ? resolveDay(fromParam) : schoolToday();

  const person = await getChatPerson(actor.schoolId, actor.id);
  if (!person) return apiError(403, "forbidden", "You do not have a role at this school.");

  const isOffice = person.roles.some((r) => ["OWNER", "PRINCIPAL", "ADMIN"].includes(r));
  const canOfferAny = isOffice || person.roles.includes("TEACHER");

  if (canOfferAny) {
    const reachable =
      isOffice || person.classTeacherOfSectionIds.includes(sectionId) || person.teachesSectionIds.includes(sectionId);
    if (!reachable) return apiError(403, "forbidden", "You do not teach that section.");

    const slots = await getSlotsForSection(actor.schoolId, sectionId, fromDate);
    return apiOk({ role: "STAFF", slots });
  }

  const link = await db.parentLink.findFirst({
    where: { schoolId: actor.schoolId, userId: actor.id, student: { sectionId } },
    select: { id: true },
  });
  if (!link) return apiError(403, "forbidden", "This is not your child's section.");

  const slots = await getBookableSlotsForSection(actor.schoolId, sectionId, fromDate);
  return apiOk({ role: "PARENT", slots });
});

const Body = z.object({
  dateIso: z.string().min(1),
  startClock: z.string().min(1),
  endClock: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  note: z.string().nullable().optional(),
});

/** Mirrors src/app/app/ptm/actions.ts::generateSlots. */
export const POST = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const { sectionId } = await params;
  const input = Body.parse(await req.json());

  const result = await generateSlotsForActor(actor, { sectionId, ...input });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ created: result.created });
});
