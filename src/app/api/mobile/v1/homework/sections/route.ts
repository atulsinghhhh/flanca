import { db } from "@/lib/db";
import { getChatPerson } from "@/lib/queries/chat";
import { requireMobileRole, TEACHING, hasRole, OFFICE } from "@/lib/mobile/session";
import { apiOk, withMobileRoute } from "@/lib/mobile/response";

/**
 * Sections (and each section's non-co-scholastic subjects) this account may
 * set homework for — mirrors src/app/app/homework/page.tsx's sectionOptions:
 * office sees every section, a teacher only the ones they are class teacher
 * of or teach a subject in.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...TEACHING);
  const isOffice = hasRole(actor, ...OFFICE);

  const person = isOffice ? null : await getChatPerson(actor.schoolId, actor.id);
  const reachable = isOffice
    ? null
    : [...new Set([...(person?.classTeacherOfSectionIds ?? []), ...(person?.teachesSectionIds ?? [])])];

  const sections = await db.section.findMany({
    where: { schoolId: actor.schoolId, ...(reachable ? { id: { in: reachable } } : {}) },
    orderBy: [{ class: { sequenceOrder: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      classId: true,
      class: {
        select: {
          name: true,
          subjects: { where: { isCoScholastic: false }, select: { id: true, name: true }, orderBy: { name: "asc" } },
        },
      },
    },
  });

  return apiOk({
    sections: sections.map((s) => ({
      sectionId: s.id,
      label: `${s.class?.name ?? ""} ${s.name}`.trim(),
      subjects: s.class?.subjects ?? [],
    })),
  });
});
