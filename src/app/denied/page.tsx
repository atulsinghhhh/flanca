import Link from "next/link";
import { Lock } from "lucide-react";
import { auth } from "@/lib/auth";
import { Mark } from "@/components/shell/mark";

export const metadata = { title: "Not your screen — Flanca" };

const ROLE_WORD: Record<string, string> = {
  OWNER: "management",
  PRINCIPAL: "the principal",
  ADMIN: "the office",
  ACCOUNTANT: "accounts",
  TEACHER: "a teacher",
  LIBRARIAN: "the library",
  STUDENT: "a student",
  PARENT: "a parent",
};

/**
 * Where a permission check lands.
 *
 * Not an error page: the person did nothing wrong, they simply opened a screen
 * that belongs to another role. So it says whose screen it is and sends them
 * back to their own, rather than scolding them.
 */
export default async function DeniedPage() {
  const session = await auth();
  const role = session?.user?.roles?.[0];

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-5 py-12">
      <div className="mb-7 flex items-center gap-2.5">
        <Mark size={26} />
        <span className="font-display text-[19px] font-semibold tracking-[-0.02em]">Flanca</span>
      </div>

      <div className="card w-full max-w-md p-7">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-paper-2 text-ink-3">
            <Lock className="size-4.5" />
          </span>
          <div>
            <h1 className="font-display text-[20px] font-semibold">That screen isn&rsquo;t yours</h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
              You are signed in as {role ? ROLE_WORD[role] ?? role.toLowerCase() : "a user"}, and this
              page belongs to a different role. Nothing has gone wrong.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/app"
            className="flex h-10 items-center justify-center rounded-md bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-dark"
          >
            Back to my screen
          </Link>
          <Link
            href="/login?e=switch"
            className="flex h-10 items-center justify-center rounded-md border border-line-2 bg-white px-4 text-[14px] font-semibold hover:bg-paper-2"
          >
            Sign in as someone else
          </Link>
        </div>

        <p className="mt-5 border-t border-line pt-4 text-[12.5px] leading-snug text-ink-3">
          If you should have access to this, ask the school office to add the role to your account.
        </p>
      </div>
    </div>
  );
}
