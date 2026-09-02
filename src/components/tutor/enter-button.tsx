"use client";

import { useState, useTransition } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { enterTutor } from "@/app/app/tutor/enter-action";

/**
 * The door.
 *
 * Fetches a one-minute single-use URL at the moment of the click and follows it.
 * Deliberately not an `<a href>`: the URL is a credential and must not sit in the
 * page's HTML waiting to be shared.
 *
 * A failure is said here, next to the button that failed, and nothing else on the
 * page changes. That is checkpoint 1 of the integrity checklist in miniature — a
 * dark tutor costs a parent one panel, not their fee page.
 */
export function EnterTutorButton({
  studentId,
  label = "Open the tutor",
  size = "sm",
  variant = "secondary",
}: {
  studentId: string;
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "quiet";
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-w-0">
      <Button
        size={size}
        variant={variant}
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await enterTutor(studentId);
            if ("error" in r) {
              setError(r.error);
              return;
            }
            window.location.assign(r.url);
          });
        }}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpRight className="size-4" />}
        {label}
      </Button>
      {error ? <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">{error}</p> : null}
    </div>
  );
}
