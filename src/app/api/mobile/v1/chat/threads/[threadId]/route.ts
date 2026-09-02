import { requireMobileActor } from "@/lib/mobile/session";
import { readAccess, canPostInThread } from "@/lib/core/chat-core";
import { getChatPerson, getThread } from "@/lib/queries/chat";
import { apiOk, apiError, withMobileRoute } from "@/lib/mobile/response";

type RouteCtx = { params: Promise<{ threadId: string }> };

/**
 * Mirrors src/app/app/chat/[threadId]/page.tsx. A plain participant read comes
 * straight back; an office OVERSIGHT read does not — exactly as on the web page,
 * the messages are only unlocked (and audited) through POST .../oversight, never
 * by this GET, so there is nothing here to leak without a recorded read.
 */
export const GET = withMobileRoute(async (req: Request, { params }: RouteCtx) => {
  const actor = await requireMobileActor(req);
  const { threadId } = await params;

  const [me, data] = await Promise.all([
    getChatPerson(actor.schoolId, actor.id),
    getThread(actor.schoolId, threadId, actor.id),
  ]);
  if (!data) return apiError(404, "not_found", "That conversation no longer exists.");
  if (!me) return apiError(403, "forbidden", "Your account is not attached to this school.");

  const access = readAccess({
    actor: me,
    thread: data.thread,
    isParticipant: data.isParticipant,
    hasLeft: data.hasLeft,
  });
  if (!access.allowed) {
    return apiError(403, "forbidden", access.reason ?? "This conversation is not yours to read.");
  }
  if (access.mode === "OVERSIGHT") {
    return apiError(
      403,
      "oversight_required",
      "Use the oversight endpoint to read this conversation; every read of it is recorded.",
    );
  }

  const postAccess = canPostInThread({
    actor: me,
    thread: data.thread,
    isParticipant: data.isParticipant,
    hasLeft: data.hasLeft,
  });

  return apiOk({
    kind: data.thread.kind,
    subject: data.subject,
    theirRole: data.theirRole,
    student: data.student,
    participants: data.participants,
    messages: data.messages,
    isParticipant: data.isParticipant,
    hasLeft: data.hasLeft,
    myUnread: data.myUnread,
    closedAt: data.thread.closedAt,
    canPost: postAccess.allowed,
  });
});
