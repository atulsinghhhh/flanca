import { requireActor } from "@/lib/session";
import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Pick a password — Flanca" };

/**
 * The one screen an issued login can reach.
 *
 * A code printed on a slip travels home in a school bag through a classroom of
 * eleven-year-olds. Treating it as a permanent password would be a decision made
 * by omission, so `requireActor` holds every other page and every server action
 * shut until this is done.
 */
export default async function SetPasswordPage() {
  const actor = await requireActor({ allowPasswordChange: true });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <p className="eyebrow text-ink-3 mb-1">Welcome</p>
      <h1 className="font-display text-[25px] leading-tight font-semibold">
        Pick your own password, {actor.name.split(" ")[0]}
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
        The school gave you a code on a slip. Choose something only you know — the code stops working
        as soon as you do.
      </p>

      <SetPasswordForm />

      <p className="mt-6 text-[12.5px] leading-relaxed text-ink-3">
        Lost the slip? The school office can print a new one. Nobody, including us, can look the old
        code up — it was never stored in a form anyone can read.
      </p>
    </main>
  );
}
