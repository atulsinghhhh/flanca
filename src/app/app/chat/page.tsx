import { MessageSquareText, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/primitives";

export const metadata = { title: "Chat — Flanca" };

/**
 * What the right-hand pane shows before any conversation is open — only ever seen
 * on a wide screen, since a phone shows the list first and lands here only by
 * explicitly going "back" to it with nothing selected.
 */
export default function ChatWelcomePane() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-paper-2 text-ink-3">
        <MessageSquareText className="size-6" />
      </span>
      <div>
        <p className="text-[15px] font-semibold text-ink-2">Select a conversation</p>
        <p className="mx-auto mt-1 max-w-xs text-[13px] text-ink-3">
          Nothing here is sent by SMS or WhatsApp — it stays in the school, on the record.
        </p>
      </div>
      <ButtonLink href="/app/chat/new" size="sm" className="mt-1">
        <Plus className="size-4" /> New conversation
      </ButtonLink>
    </div>
  );
}
