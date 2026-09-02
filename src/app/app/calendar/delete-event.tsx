"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { deleteCalendarEvent } from "@/app/app/notices/actions";

export function DeleteEvent({ eventId, title }: { eventId: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function remove() {
    if (!window.confirm(`Remove "${title}" from the calendar?`)) return;
    start(async () => {
      await deleteCalendarEvent(eventId);
      router.refresh();
    });
  }

  return (
    <button
      onClick={remove}
      disabled={pending}
      title="Remove"
      className="shrink-0 rounded-md p-1 text-ink-3 transition-colors hover:bg-overdue-light hover:text-overdue disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
    </button>
  );
}
