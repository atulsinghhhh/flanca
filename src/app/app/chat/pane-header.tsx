import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "./avatar";

/**
 * The header bar of whatever is open in the right-hand pane — a conversation, the
 * "who would you like to write to" picker, or nothing yet.
 *
 * The back arrow only shows on a phone. On a wider screen the conversation list is
 * always visible in its own column, so there is nowhere to "go back" to — the list
 * and the open conversation sit side by side, the way a messaging app does it.
 */
export function PaneHeader({
  avatarName,
  title,
  sub,
  actions,
}: {
  avatarName?: string;
  title: string;
  sub?: string | null;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-4">
      <Link
        href="/app/chat"
        className="-ml-1 rounded-md p-1.5 text-ink-2 hover:bg-paper-2 lg:hidden"
        aria-label="Back to conversations"
      >
        <ArrowLeft className="size-4.5" />
      </Link>
      {avatarName ? <Avatar name={avatarName} /> : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold leading-tight">{title}</p>
        {sub ? <p className="truncate text-[12px] leading-tight text-ink-3">{sub}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
