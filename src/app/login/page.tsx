import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Mark } from "@/components/shell/mark";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in — Flanca" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const { e } = await searchParams;
  // Never bounce back to /app when we were sent here BECAUSE the session is bad —
  // that is exactly how a redirect loop happens.
  const session = await auth();
  if (session?.user?.id && !e) redirect("/app");

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* left: the promise, stated plainly */}
      <div className="relative hidden flex-col justify-between bg-brand p-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="rounded-md bg-white/15 p-1.5">
            <Mark size={22} />
          </div>
          <span className="font-display text-[19px] font-semibold">Flanca</span>
        </div>

        <div className="max-w-md">
          <h1 className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.02em] text-white">
            The school system you can switch on this afternoon.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/80">
            Admissions, fees, attendance, exams, report cards and compliance — one tap per task,
            working offline, at a price we publish.
          </p>
          <ul className="mt-8 space-y-2.5 text-[14px] text-white/85">
            {[
              "Attendance in one tap, even with no signal",
              "Itemised fees — no hidden convenience charge",
              "Report cards for a whole class in one action",
              "APAAR and UDISE+ tracked, not chased",
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-white/60" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[12.5px] text-white/55">Built for Indian schools · flanca.online</p>
      </div>

      {/* right: the form */}
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-7 lg:hidden">
            <Mark size={30} />
          </div>
          <p className="eyebrow text-ink-3">Sign in</p>
          <h2 className="mt-1 font-display text-[23px] font-semibold">Welcome back</h2>
          <p className="mt-1.5 text-[13.5px] text-ink-3">Use your school email or mobile number.</p>

          {e ? (
            <p className="mt-4 rounded-md border border-marigold/30 bg-marigold-light px-3 py-2 text-[13px] text-marigold-ink-strong">
              {e === "no-school"
                ? "That account is not attached to a school yet. Ask your office to add you."
                : "Your session expired. Please sign in again."}
            </p>
          ) : null}

          <LoginForm />
        </div>
      </div>
    </div>
  );
}
