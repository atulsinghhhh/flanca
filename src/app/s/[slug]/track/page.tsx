import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicSchool, trackApplication } from "@/lib/queries/public-school";
import "../../public.css";

export const metadata = { title: "Check your application" };

/** What each status actually means to a parent, in their words not ours. */
const STAGES: Array<{ value: string; label: string; meaning: string }> = [
  { value: "SUBMITTED", label: "Received", meaning: "The office has your application." },
  { value: "UNDER_REVIEW", label: "Being read", meaning: "Someone is going through it now." },
  { value: "DOCUMENTS_PENDING", label: "Papers needed", meaning: "The school needs a document from you — see the note below." },
  { value: "SHORTLISTED", label: "Shortlisted", meaning: "Your child is on the shortlist. The school will call you." },
  { value: "OFFERED", label: "Seat offered", meaning: "A seat has been offered. Contact the office to confirm it." },
  { value: "ENROLLED", label: "Admitted", meaning: "Your child is on the roll. Welcome." },
];

const DATE = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ no?: string; phone?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const data = await getPublicSchool(slug);
  if (!data) notFound();

  const searched = Boolean(sp.no?.trim() && sp.phone?.trim());
  const result = searched ? await trackApplication(slug, sp.no!, sp.phone!) : null;
  const application = result?.application ?? null;

  const stageIndex = application ? STAGES.findIndex((s) => s.value === application.status) : -1;
  const rejected = application?.status === "REJECTED" || application?.status === "WITHDRAWN";

  return (
    <div className="school-page min-h-dvh">
      <header className="board px-6 py-7">
        <div className="mx-auto max-w-2xl">
          <Link href={`/s/${slug}`} className="plaque text-[#c9a227] hover:text-[#e0b83c]">
            ← {data.school.name}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
        <p className="plaque text-[var(--ink-3)]">Admissions</p>
        <h1 className="display mt-3 text-[32px] leading-tight sm:text-[38px]">
          Check your application
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--ink-2)]">
          Enter the application number you were given and the mobile number you applied with.
        </p>

        <form method="get" className="paper-card mt-8 p-6 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="no" className="mb-1.5 block text-[13.5px] font-semibold">
                Application number
              </label>
              <input
                id="no"
                name="no"
                defaultValue={sp.no ?? ""}
                required
                placeholder="APP/26-27/0042"
                className="h-11 w-full rounded-[4px] border border-[var(--rule)] bg-white px-3 font-mono text-[14px] outline-none focus:border-[var(--board)]"
              />
            </div>
            <div>
              <label htmlFor="phone" className="mb-1.5 block text-[13.5px] font-semibold">
                Mobile number
              </label>
              <input
                id="phone"
                name="phone"
                defaultValue={sp.phone ?? ""}
                required
                inputMode="numeric"
                placeholder="10 digits"
                className="h-11 w-full rounded-[4px] border border-[var(--rule)] bg-white px-3 text-[15px] outline-none focus:border-[var(--board)]"
              />
            </div>
          </div>
          <button
            type="submit"
            className="mt-5 flex h-12 w-full items-center justify-center rounded-[4px] bg-[var(--board)] text-[15.5px] font-semibold text-[#f6f3e9] hover:brightness-110"
          >
            Show my application
          </button>
        </form>

        {searched && !application ? (
          <div className="paper-card mt-6 p-6">
            <p className="text-[15px] font-semibold">We could not find that application.</p>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-2)]">
              Check the application number and make sure the mobile number is the same one you
              applied with. If it still does not appear, call the office on{" "}
              <a href={`tel:${data.school.phone ?? ""}`} className="font-semibold underline">
                {data.school.phone ?? "the school"}
              </a>
              .
            </p>
          </div>
        ) : null}

        {application ? (
          <div className="paper-card mt-6 p-6 sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--rule)] pb-5">
              <div>
                <p className="plaque text-[var(--ink-3)]">{application.applicationNo}</p>
                <h2 className="display mt-2 text-[24px]">{application.studentName}</h2>
                <p className="mt-1 text-[13.5px] text-[var(--ink-2)]">
                  {application.classSought ?? "—"} · applied {DATE(application.submittedAt)}
                </p>
              </div>
            </div>

            {rejected ? (
              <p className="mt-6 text-[15px] leading-relaxed">
                This application is closed
                {application.status === "WITHDRAWN" ? " because it was withdrawn." : "."}{" "}
                {application.reviewNote ?? "Please contact the office if you would like to discuss it."}
              </p>
            ) : (
              <>
                <ol className="mt-6">
                  {STAGES.map((stage, i) => {
                    const done = stageIndex >= i;
                    const current = stageIndex === i;
                    return (
                      <li key={stage.value} className="flex gap-4 pb-5 last:pb-0">
                        <div className="flex flex-col items-center">
                          <span
                            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                              current
                                ? "border-[var(--board)] bg-[var(--board)] text-[#f6f3e9]"
                                : done
                                  ? "border-[var(--board)] bg-[var(--board)]/12 text-[var(--board)]"
                                  : "border-[var(--rule)] text-[var(--ink-3)]"
                            }`}
                          >
                            {done ? "✓" : ""}
                          </span>
                          {i < STAGES.length - 1 ? (
                            <span
                              className={`mt-1 w-px flex-1 ${done ? "bg-[var(--board)]/35" : "bg-[var(--rule)]"}`}
                            />
                          ) : null}
                        </div>
                        <div className="pb-1">
                          <p
                            className={`text-[15px] ${current ? "font-semibold" : done ? "font-medium" : "text-[var(--ink-3)]"}`}
                          >
                            {stage.label}
                          </p>
                          {current ? (
                            <p className="mt-1 text-[14px] leading-relaxed text-[var(--ink-2)]">
                              {stage.meaning}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {application.documentsNote ? (
                  <p className="mt-2 rounded-[4px] border border-[var(--marigold)]/40 bg-[#fdf3e2] px-4 py-3 text-[14px] leading-relaxed text-[#6d4409]">
                    <strong className="font-semibold">From the office:</strong>{" "}
                    {application.documentsNote}
                  </p>
                ) : null}
              </>
            )}

            <p className="mt-6 border-t border-[var(--rule)] pt-4 text-[12.5px] text-[var(--ink-3)]">
              Last updated {DATE(application.updatedAt)}. This page shows only your own application.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
