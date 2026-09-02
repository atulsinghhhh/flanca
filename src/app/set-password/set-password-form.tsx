"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { setOwnPassword } from "./actions";

const INPUT =
  "h-10 w-full rounded-md border border-line-2 bg-white px-3 text-[14px] outline-none focus:border-brand";

export function SetPasswordForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-7 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await setOwnPassword({ current, next, confirm });
          if ("error" in r) {
            setError(r.error);
            return;
          }
          // Straight to their own home page — the point of this screen is that it
          // is the only thing in the way.
          router.replace("/app");
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">The code on your slip</span>
        <input
          className={`${INPUT} font-mono tracking-wider`}
          type="text"
          autoComplete="current-password"
          autoCapitalize="none"
          spellCheck={false}
          value={current}
          onChange={(e) => setCurrent(e.target.value.trim())}
          required
          autoFocus
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Your new password</span>
        <input
          className={INPUT}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={8}
        />
        <span className="text-[12px] text-ink-3">At least 8 characters. Something you will remember.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Type it again</span>
        <input
          className={INPUT}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </label>

      {error ? (
        <p role="alert" className="rounded-md bg-overdue-light px-3 py-2 text-[13px] text-overdue">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} size="md">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Save it and carry on
      </Button>
    </form>
  );
}
