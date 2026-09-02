"use client";

import { useState, useTransition } from "react";
import { Check, KeyRound, Loader2 } from "lucide-react";
import { Button, Card, CardHead } from "@/components/ui/primitives";
import { changeMyPassword } from "@/app/app/staff/people-actions";

const INPUT =
  "h-9.5 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand";

/**
 * Changing your own password.
 *
 * The office hands out a first password and can reset it, which means until this
 * existed every password in the school was known to whoever typed it in. This is the
 * other half of that: the person it belongs to can make it theirs.
 */
export function PasswordCard() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = again.length > 0 && again !== next;

  return (
    <Card>
      <CardHead title="Your password" hint="Only you can change this. Nobody, including the office, can read it." />
      <div className="space-y-3.5 px-5 py-4">
        {error ? (
          <p className="rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13.5px] text-overdue">
            {error}
          </p>
        ) : null}
        {done ? (
          <p className="flex items-center gap-2 rounded-md border border-good/25 bg-good-light px-3 py-2 text-[13.5px] font-medium text-good">
            <Check className="size-4" /> Changed. Use the new one next time you sign in.
          </p>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold">Password you use now</span>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className={INPUT} autoComplete="current-password" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold">New password</span>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={INPUT} autoComplete="new-password" />
          {tooShort ? <p className="mt-1 text-[12px] text-marigold">At least 8 characters.</p> : null}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold">New password again</span>
          <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} className={INPUT} autoComplete="new-password" />
          {mismatch ? <p className="mt-1 text-[12px] text-marigold">These two do not match.</p> : null}
        </label>

        <Button
          disabled={pending || !current || next.length < 8 || next !== again}
          onClick={() => {
            setError(null);
            setDone(false);
            start(async () => {
              const r = await changeMyPassword({ current, next });
              if (r.error) {
                setError(r.error);
                return;
              }
              setDone(true);
              setCurrent("");
              setNext("");
              setAgain("");
            });
          }}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Change password
        </Button>
      </div>
    </Card>
  );
}
