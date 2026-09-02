import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { hasRole, requireActor, OFFICE } from "@/lib/session";
import { readAccess } from "@/lib/core/chat-core";
import { getChatPerson, getThread } from "@/lib/queries/chat";
import { AutoScroll, Composer, MarkRead, PollRefresh } from "../composer";
import { OversightOpen } from "../oversight";
import { CloseThread } from "../close-thread";
import { MuteThread } from "../mute-thread";
import { PaneHeader } from "../pane-header";

export const metadata = { title: "Conversation — Flanca" };

const STAMP = (d: Date) =>
  d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const actor = await requireActor();

  const [me, data] = await Promise.all([
    getChatPerson(actor.schoolId, actor.id),
    getThread(actor.schoolId, threadId, actor.id),
  ]);
  if (!me || !data) notFound();

  const access = readAccess({
    actor: me,
    thread: data.thread,
    isParticipant: data.isParticipant,
    hasLeft: data.hasLeft,
  });

  const canClose = hasRole(actor, ...OFFICE);
  const myMutedAt = data.isParticipant
    ? (await db.threadParticipant.findFirst({ where: { threadId, userId: actor.id }, select: { mutedAt: true } }))
        ?.mutedAt ?? null
    : null;
  const others = data.participants.filter((p) => p.userId !== actor.id);
  const title = others.map((p) => p.name).join(", ") || "Conversation";
  const about = data.student
    ? `${data.student.name} · ${data.student.class?.name ?? ""}${data.student.section ? ` ${data.student.section.name}` : ""} · ${data.student.admissionNumber}`
    : null;

  if (!access.allowed) {
    return (
      <>
        <PaneHeader title={title} />
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <p className="max-w-sm text-[13.5px] text-ink-3">
            {access.reason ?? "This conversation is not yours to read."}
          </p>
        </div>
      </>
    );
  }

  // The office may read anything, but never silently. The messages are fetched by
  // the action behind the button, not by this page, so there is no way to see them
  // without the audit row being written first.
  if (access.mode === "OVERSIGHT") {
    return (
      <>
        <PaneHeader
          avatarName={title}
          title={title}
          sub={about}
          actions={
            <>
              {data.isParticipant ? <MuteThread threadId={threadId} muted={Boolean(myMutedAt)} /> : null}
              {canClose ? <CloseThread threadId={threadId} closed={Boolean(data.thread.closedAt)} /> : null}
            </>
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <OversightOpen
            threadId={threadId}
            between={data.participants.map((p) => p.name).join(" and ")}
            about={data.student?.name ?? null}
          />
        </div>
      </>
    );
  }

  const closedNote = data.thread.closedAt
    ? "This conversation has been closed. It stays readable, but nobody can reply."
    : null;

  return (
    <>
      <PaneHeader
        avatarName={title}
        title={title}
        sub={data.subject ?? about}
        actions={
          <>
            {data.isParticipant ? <MuteThread threadId={threadId} muted={Boolean(myMutedAt)} /> : null}
            {canClose ? <CloseThread threadId={threadId} closed={Boolean(data.thread.closedAt)} /> : null}
          </>
        }
      />

      <MarkRead threadId={threadId} unread={data.myUnread} />
      <PollRefresh seconds={10} />

      <AutoScroll scrollId="chat-scroll" dep={data.messages.length} />

      <div id="chat-scroll" className="min-h-0 flex-1 overflow-y-auto bg-paper-2/30">
        {data.messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="text-[13.5px] text-ink-3">Nothing said yet. Write the first message below.</p>
          </div>
        ) : (
          <ul className="flex min-h-full flex-col justify-end space-y-2.5 px-4 py-4">
            {data.messages.map((m) => (
              <li key={m.id} className={m.mine ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                    m.mine
                      ? "rounded-br-sm bg-brand text-white"
                      : "rounded-bl-sm border border-line bg-white text-ink"
                  }`}
                >
                  {!m.mine ? (
                    <p className="mb-1 text-[11.5px] font-semibold text-ink-3">{m.senderName}</p>
                  ) : null}
                  <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 text-right text-[10.5px] ${m.mine ? "text-white/75" : "text-ink-3"}`}>
                    {STAMP(m.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0">
        <Composer threadId={threadId} disabled={closedNote} />
        <p className="flex items-start gap-1.5 border-t border-line bg-paper-2/40 px-4 py-2 text-[11px] leading-relaxed text-ink-3">
          <ShieldCheck className="mt-0.5 size-3 shrink-0" />
          Kept by the school. The principal and the office can open this if they need to, and every time
          they do it is written to the audit trail with their name.
        </p>
      </div>
    </>
  );
}
