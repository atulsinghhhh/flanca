import { z } from "zod";
import { db } from "@/lib/db";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { logVisitorForActor } from "@/lib/mobile/mutations/gate";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/**
 * Today's visitor log. Mirrors the data src/app/app/gate/page.tsx reads:
 * every visitor logged in today, most recent first, plus who is still inside.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const visitors = await db.visitor.findMany({
    where: { schoolId: actor.schoolId, inAt: { gte: dayStart } },
    orderBy: { inAt: "desc" },
  });

  const inside = visitors.filter((v) => !v.outAt);

  return apiOk({ visitors, insideCount: inside.length });
});

const Body = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  purpose: z.string().optional(),
  whomToMeet: z.string().optional(),
  idProof: z.string().optional(),
});

/** Mirrors src/app/app/gate/actions.ts::logVisitor. */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await logVisitorForActor(actor, input);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ visitorId: result.visitorId, passNo: result.passNo }, 201);
});
