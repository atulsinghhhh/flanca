import { db } from "@/lib/db";
import { audit, type Actor } from "@/lib/session";
import { nextNumber } from "@/lib/sequence";

/**
 * The mobile-API twin of src/app/app/gate/actions.ts.
 *
 * Same authorization (OFFICE, checked by the route via requireMobileRole before
 * these run), same writes, same audit trail — just handed an `actor` instead of
 * calling `requireRole()`, and returning a discriminated result instead of the
 * `{error}`/`{ok}` shape a server action's caller expects, so a route handler
 * can turn it into the right HTTP status. revalidatePath is a Next.js
 * page-cache concern with nothing to invalidate for a stateless JSON client,
 * so it is dropped here — everything else is preserved.
 */

type Failure = { ok: false; status: number; code: string; message: string };

const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });
const notFound = (message: string): Failure => ({ ok: false, status: 404, code: "not_found", message });
const conflict = (message: string): Failure => ({ ok: false, status: 409, code: "conflict", message });

export type LogVisitorInput = {
  name: string;
  phone?: string;
  purpose?: string;
  whomToMeet?: string;
  idProof?: string;
};

export type LogVisitorResult = Failure | { ok: true; visitorId: string; passNo: string };

/** Mirrors src/app/app/gate/actions.ts::logVisitor. */
export async function logVisitorForActor(actor: Actor, input: LogVisitorInput): Promise<LogVisitorResult> {
  if (!input.name.trim()) return invalid("Enter the visitor's name.");

  const visitor = await db.visitor.create({
    data: {
      schoolId: actor.schoolId,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      purpose: input.purpose?.trim() || null,
      whomToMeet: input.whomToMeet?.trim() || null,
      idProof: input.idProof?.trim() || null,
      passNo: `V-${Date.now().toString().slice(-5)}`,
    },
  });

  return { ok: true, visitorId: visitor.id, passNo: visitor.passNo! };
}

export type SimpleResult = Failure | { ok: true };

/** Mirrors src/app/app/gate/actions.ts::signVisitorOut. */
export async function signVisitorOutForActor(actor: Actor, visitorId: string): Promise<SimpleResult> {
  const visitor = await db.visitor.findFirst({
    where: { id: visitorId, schoolId: actor.schoolId },
  });
  if (!visitor) return notFound("That visitor is not on today's log.");
  if (visitor.outAt) return conflict("Already signed out.");

  await db.visitor.update({ where: { id: visitor.id }, data: { outAt: new Date() } });
  return { ok: true };
}

export type IssueGatePassInput = {
  studentId: string;
  reason: string;
  releasedTo: string;
  relation?: string;
};

export type IssueGatePassResult = Failure | { ok: true; passId: string; passNo: string };

/**
 * Early pickup. This is a safety record: who took the child, on whose approval,
 * with a serial. It is the page a school gets asked for when something goes wrong.
 * Mirrors src/app/app/gate/actions.ts::issueGatePass.
 */
export async function issueGatePassForActor(actor: Actor, input: IssueGatePassInput): Promise<IssueGatePassResult> {
  const student = await db.student.findFirst({
    where: { id: input.studentId, schoolId: actor.schoolId, status: "ACTIVE" },
    select: { id: true, name: true, class: { select: { name: true } } },
  });
  if (!student) return notFound("That student is not on the roll.");
  if (!input.reason.trim()) return invalid("Record why the child is leaving early.");
  if (!input.releasedTo.trim()) return invalid("Record who the child is being released to.");

  // The number and the pass are written together. Allocating the number in its own
  // transaction first would consume it even when the pass below failed — and a
  // missing GP/ number is exactly what a parent disputing a release will point at.
  const { pass, passNo } = await db.$transaction(async (tx) => {
    const no = await nextNumber(tx, actor.schoolId, "GATEPASS", "GP/");
    const created = await tx.gatePass.create({
      data: {
        schoolId: actor.schoolId,
        studentId: student.id,
        passNo: no,
        reason: input.reason.trim(),
        releasedTo: input.releasedTo.trim(),
        relation: input.relation?.trim() || null,
        approvedBy: actor.id,
      },
    });
    return { pass: created, passNo: no };
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "gate.pass.issue",
    entity: "GatePass",
    entityId: pass.id,
    summary: `Gate pass ${passNo}: ${student.name} (${student.class?.name ?? "—"}) released to ${input.releasedTo.trim()} — ${input.reason.trim()}`,
  });

  return { ok: true, passId: pass.id, passNo };
}
