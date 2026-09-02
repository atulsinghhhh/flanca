"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { unpublishCircular } from "./actions";

export function Unpublish({ circularId }: { circularId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function submit() {
    if (!window.confirm("Withdraw this circular? Messages already sent cannot be recalled.")) return;
    start(async () => {
      await unpublishCircular(circularId);
      router.refresh();
    });
  }

  return (
    <button
      onClick={submit}
      disabled={pending}
      className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-3 underline decoration-dotted underline-offset-2 hover:text-overdue disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : null}
      Unpublish
    </button>
  );
}
