import { z } from "zod";
import { db } from "@/lib/db";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { issueGatePassForActor } from "@/lib/mobile/mutations/gate";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/**
 * Today's early-pickup gate passes. Mirrors the second half of
 * src/app/app/gate/page.tsx's read side — a distinct list from the visitor
 * log, since a pass is a child leaving with someone, not a guest arriving.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const passes = await db.gatePass.findMany({
    where: { schoolId: actor.schoolId, issuedAt: { gte: dayStart } },
    orderBy: { issuedAt: "desc" },
  });

  const students = await db.student.findMany({
    where: { id: { in: passes.map((p) => p.studentId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, name: true, class: { select: { name: true } }, section: { select: { name: true } } },
  });
  const studentById = new Map(students.map((s) => [s.id, s]));

  return apiOk({
    passes: passes.map((p) => {
      const student = p.studentId ? studentById.get(p.studentId) : undefined;
      return {
        id: p.id,
        passNo: p.passNo,
        studentName: student?.name ?? null,
        className: student?.class?.name ?? null,
        sectionName: student?.section?.name ?? null,
        reason: p.reason,
        releasedTo: p.releasedTo,
        relation: p.relation,
        issuedAt: p.issuedAt,
      };
    }),
  });
});

const Body = z.object({
  studentId: z.string().min(1),
  reason: z.string().min(1),
  releasedTo: z.string().min(1),
  relation: z.string().optional(),
});

/**
 * Early pickup. Mirrors src/app/app/gate/actions.ts::issueGatePass — a safety
 * record: who took the child, on whose approval, with a serial.
 */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await issueGatePassForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ passId: result.passId, passNo: result.passNo }, 201);
});
