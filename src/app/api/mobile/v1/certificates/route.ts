import { z } from "zod";
import { db } from "@/lib/db";
import { requireMobileRole, OFFICE } from "@/lib/mobile/session";
import { CERTIFICATE_TYPES } from "@/lib/core/certificate-core";
import { peekNumber } from "@/lib/sequence";
import { issueCertificateForActor } from "@/lib/mobile/mutations/certificates";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

/**
 * List. Mirrors src/app/app/certificates/page.tsx's data: certificates
 * (optionally filtered by ?type=), counts per type, and the next serial each
 * type would get if issued now.
 */
export const GET = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const type = new URL(req.url).searchParams.get("type") ?? undefined;

  const [certificates, counts, nextSerials] = await Promise.all([
    db.certificate.findMany({
      where: {
        schoolId: actor.schoolId,
        ...(type ? { type: type as never } : {}),
      },
      orderBy: { issuedOn: "desc" },
      take: 60,
      include: {
        student: {
          select: {
            id: true, name: true, admissionNumber: true,
            class: { select: { name: true } },
          },
        },
      },
    }),
    db.certificate.groupBy({ by: ["type"], where: { schoolId: actor.schoolId }, _count: true }),
    Promise.all(
      CERTIFICATE_TYPES.map(async (t) => ({
        type: t.value,
        next: await peekNumber(actor.schoolId, t.sequenceKind),
      })),
    ),
  ]);

  const countByType = Object.fromEntries(counts.map((c) => [c.type, c._count]));
  const total = counts.reduce((a, c) => a + c._count, 0);
  const nextByType = Object.fromEntries(nextSerials.map((n) => [n.type, n.next]));

  return apiOk({
    certificates,
    total,
    countByType,
    nextByType,
    cancelledCount: certificates.filter((c) => c.cancelledAt).length,
  });
});

const Body = z.object({
  studentId: z.string().min(1),
  type: z.string().min(1),
  issuedOn: z.string().optional(),
  purpose: z.string().optional(),
  conduct: z.string().optional(),
  leavingReason: z.string().optional(),
  remarks: z.string().optional(),
  markTransferred: z.boolean().optional(),
});

/**
 * Mirrors src/app/app/certificates/actions.ts::issueCertificate. Validated
 * loosely here — only studentId/type are required — because the fields each
 * certificate type actually needs vary per certificate-core.ts's vocabulary,
 * and the mutation (via certificateMeta) is what enforces that, exactly as
 * the web action does.
 */
export const POST = withMobileRoute(async (req: Request) => {
  const actor = await requireMobileRole(req, ...OFFICE);
  const input = Body.parse(await req.json());

  const result = await issueCertificateForActor(actor, {
    ...input,
    type: input.type as never,
  });
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return apiOk({ certificateId: result.certificateId, serialNo: result.serialNo }, 201);
});
