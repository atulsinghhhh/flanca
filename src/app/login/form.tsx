"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      identifier: String(form.get("identifier") ?? ""),
      password: String(form.get("password") ?? ""),
      redirect: false,
    });

    if (result?.error) {
      setError("That email/mobile and password don't match. Try again.");
      setPending(false);
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3.5">
      <div>
        <label htmlFor="identifier" className="mb-1.5 block text-[13px] font-semibold">
          Email or mobile
        </label>
        <input
          id="identifier"
          name="identifier"
          autoComplete="username"
          required
          autoFocus
          className="h-11 w-full rounded-md border border-line-2 bg-white px-3 text-[14.5px] outline-none focus:border-brand"
          placeholder="principal@subhashacademy.edu.in"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-[13px] font-semibold">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 w-full rounded-md border border-line-2 bg-white px-3 text-[14.5px] outline-none focus:border-brand"
          placeholder="••••••••"
        />
      </div>

      {error ? (
        <p className="rounded-md border border-overdue/25 bg-overdue-light px-3 py-2 text-[13px] text-overdue">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
