import { requireActor } from "@/lib/session";
import { getInbox } from "@/lib/queries/chat";
import { pushPublicKey } from "@/lib/push";
import { ChatShell } from "./chat-shell";

/**
 * Every /app/chat/* route shares one shell: the conversation list never leaves
 * the screen, only the pane on the right changes — the list itself, a new-message
 * picker, or an open conversation. Fetched once here rather than per page, so
 * switching conversations does not re-fetch or re-flash the list it is sitting in.
 */
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();

  const [open, closed] = await Promise.all([
    getInbox(actor.schoolId, actor.id, { closed: false }),
    getInbox(actor.schoolId, actor.id, { closed: true }),
  ]);

  return (
    <ChatShell open={open} closed={closed} pushKey={pushPublicKey()}>
      {children}
    </ChatShell>
  );
}
