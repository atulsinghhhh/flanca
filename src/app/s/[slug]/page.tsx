import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicSchool } from "@/lib/queries/public-school";
import { formatMoney } from "@/lib/core/money";
import "../public.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicSchool(slug);
  if (!data) return { title: "School not found" };

  return {
    title: `${data.school.name} — admissions, fees and notices`,
    description: `${data.school.name}, ${data.school.city ?? ""}. Apply online, see the published fee structure, and check your application status.`,
  };
}

const DATE = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function PublicSchoolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicSchool(slug);
  if (!data) notFound();

  const { school, year, fees, heads, circulars, events, stats } = data;
  const usedHeads = heads.filter((h) => fees.some((f) => f.byHead[h] != null));

  return (
    <div className="school-page min-h-dvh">
      {/* ─────────────── the gate board ─────────────── */}
      <header className="board px-6 py-10 sm:py-14">
        <div className="mx-auto max-w-5xl text-center">
          <p className="plaque text-[#c9a227]">
            {school.board === "CBSE" ? "Affiliated to the Central Board of Secondary Education" : `${school.board} school`}
          </p>

          <h1 className="display mt-4 text-[34px] leading-[1.06] sm:text-[52px]">{school.name}</h1>

          <p className="mt-3 text-[14px] text-[#f6f3e9]/75 sm:text-[15px]">
            {locationLine(school.address, school.city, school.state)}
          </p>

          <div className="rule-gold rule-draw mx-auto mt-7 max-w-md" />

          {/* Credibility as an artifact: the numbers a parent actually checks. */}
          <dl className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-x-8 gap-y-3">
            {school.affiliationNo ? (
              <Credential label="CBSE Affiliation" value={school.affiliationNo} />
            ) : null}
            {school.udiseCode ? <Credential label="UDISE Code" value={school.udiseCode} /> : null}
            <Credential label="Academic year" value={year?.name ?? "—"} />
          </dl>
        </div>
      </header>

      {/* ─────────────── admissions + the principal's word ─────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
          <div>
            <p className="plaque text-[var(--ink-3)]">From the Principal</p>
            <p className="display mt-4 text-[23px] leading-[1.45] sm:text-[27px]">
              We would rather you knew exactly what we charge, what we teach and when the term ends
              before you visit — than find out afterwards.
            </p>
            <p className="mt-5 text-[15px] leading-relaxed text-[var(--ink-2)]">
              Everything on this page comes straight from the school&rsquo;s own records: the fee
              structure we actually bill, the notices we have actually sent, the dates already in the
              calendar. If something here is out of date, it is out of date in our office too.
            </p>
            <p className="mt-5 text-[14px] text-[var(--ink-3)]">
              — {school.principalName ?? "The Principal"}, Principal
            </p>

            <dl className="mt-9 flex flex-wrap gap-x-10 gap-y-5">
              <Figure value={stats.students.toLocaleString("en-IN")} label="Students on roll" />
              <Figure value={String(stats.staff)} label="Teachers and staff" />
              <Figure value={stats.classRange} label="Classes" small />
            </dl>
          </div>

          {/* the one loud thing on the page */}
          <aside className="paper-card self-start p-7">
            <p className="plaque text-[var(--ink-3)]">Admissions {year?.name ?? ""}</p>
            <h2 className="display mt-3 text-[27px] leading-tight">Apply online. Track it yourself.</h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--ink-2)]">
              Fill the form once. You get an application number the same minute, and you can check
              where it has reached without telephoning the office.
            </p>

            <Link
              href={`/s/${school.slug}/apply`}
              className="mt-6 flex h-12 w-full items-center justify-center rounded-[4px] bg-[var(--marigold)] text-[15.5px] font-semibold text-[#231402] transition-[filter] hover:brightness-95"
            >
              Start an application
            </Link>

            <Link
              href={`/s/${school.slug}/track`}
              className="mt-2.5 flex h-12 w-full items-center justify-center rounded-[4px] border border-[var(--rule)] bg-white text-[15px] font-semibold transition-colors hover:bg-[var(--paper-2)]"
            >
              Check my application
            </Link>

            {school.phone ? (
              <p className="mt-5 border-t border-[var(--rule)] pt-4 text-[13px] text-[var(--ink-3)]">
                Rather speak to someone? Call the office on{" "}
                <a href={`tel:${school.phone}`} className="font-semibold text-[var(--ink)] underline">
                  {school.phone}
                </a>
                .
              </p>
            ) : null}
          </aside>
        </div>
      </section>

      {/* ─────────────── the fee structure, published ─────────────── */}
      <section className="border-y border-[var(--rule)] bg-[var(--paper-2)]/60">
        <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="plaque text-[var(--ink-3)]">Fee structure {year?.name ?? ""}</p>
              <h2 className="display mt-3 text-[28px] leading-tight sm:text-[34px]">
                What this school costs, in full.
              </h2>
            </div>
            <p className="max-w-sm text-[14px] leading-relaxed text-[var(--ink-2)]">
              Annual fees per class, broken out by head. There is no convenience fee and no charge
              for paying by UPI.
            </p>
          </div>

          {fees.length === 0 ? (
            <p className="mt-8 text-[15px] text-[var(--ink-3)]">
              The fee structure for this year has not been published yet.
            </p>
          ) : (
            <div className="mt-8 overflow-x-auto">
              <table className="ruled w-full min-w-[640px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="border-b-2 border-[var(--board)]">
                    <th className="plaque py-2.5 pr-4 text-left text-[var(--ink-3)]">Class</th>
                    {usedHeads.map((h) => (
                      <th key={h} className="plaque px-3 py-2.5 text-right text-[var(--ink-3)]">
                        {h}
                      </th>
                    ))}
                    <th className="plaque px-3 py-2.5 text-right text-[var(--ink-3)]">Per year</th>
                    <th className="plaque py-2.5 pl-3 text-right text-[var(--ink-3)]">Per term</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.map((f) => (
                    <tr key={f.className} className="border-b border-[var(--rule)]">
                      <td data-title className="py-2.5 pr-4 font-medium whitespace-nowrap">{f.className}</td>
                      {usedHeads.map((h) => (
                        <td key={h} data-label={h} className="tnum px-3 py-2.5 text-right text-[var(--ink-2)]">
                          {f.byHead[h] != null ? formatMoney(f.byHead[h]) : "—"}
                        </td>
                      ))}
                      <td data-label="Per year" className="tnum px-3 py-2.5 text-right font-semibold">
                        {formatMoney(f.annual)}
                      </td>
                      <td data-label="Per term" className="tnum py-2.5 pl-3 text-right text-[var(--ink-2)]">
                        {formatMoney(f.perTerm)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-5 max-w-2xl text-[13px] leading-relaxed text-[var(--ink-3)]">
            Transport is charged separately, by stop, and only for children who use the bus.
            Concessions (sibling, staff ward, RTE, merit) are applied to the tuition head and appear
            as their own line on every invoice.
          </p>
        </div>
      </section>

      {/* ─────────────── notices and dates ─────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <p className="plaque text-[var(--ink-3)]">Notice board</p>
            <h2 className="display mt-3 text-[24px]">What the school has told parents</h2>

            {circulars.length === 0 ? (
              <p className="mt-6 text-[14px] text-[var(--ink-3)]">No public notices at the moment.</p>
            ) : (
              <ul className="mt-6">
                {circulars.map((c) => (
                  <li key={c.id} className="ruled-row py-4">
                    <p className="text-[15px] font-semibold">{c.title}</p>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--ink-2)]">{c.body}</p>
                    <p className="mt-2 text-[12px] text-[var(--ink-3)]">
                      {c.publishedAt ? DATE(c.publishedAt) : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="plaque text-[var(--ink-3)]">School calendar</p>
            <h2 className="display mt-3 text-[24px]">Dates already fixed</h2>

            {events.length === 0 ? (
              <p className="mt-6 text-[14px] text-[var(--ink-3)]">Nothing scheduled yet.</p>
            ) : (
              <ul className="mt-6">
                {events.map((e) => (
                  <li key={e.id} className="ruled-row flex items-baseline gap-5 py-3.5">
                    <div className="w-[92px] shrink-0">
                      <p className="tnum text-[14px] font-semibold">
                        {e.startDate.toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          timeZone: "UTC",
                        })}
                      </p>
                      {e.endDate ? (
                        <p className="text-[11.5px] text-[var(--ink-3)]">
                          to{" "}
                          {e.endDate.toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            timeZone: "UTC",
                          })}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-[14.5px] font-medium">{e.title}</p>
                      <p className="text-[12px] text-[var(--ink-3)]">
                        {e.kind.charAt(0) + e.kind.slice(1).toLowerCase()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ─────────────── footer ─────────────── */}
      <footer className="board px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <p className="display text-[19px] text-[#f6f3e9]">{school.name}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-[#f6f3e9]/65">
                {locationLine(school.address, school.city, school.state)}
              </p>
              <p className="mt-2 text-[13px] text-[#f6f3e9]/65">
                {[school.phone, school.email].filter(Boolean).join(" · ")}
              </p>
            </div>

            <div className="sm:text-right">
              <p className="plaque text-[#c9a227]">Verify a certificate</p>
              <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-[#f6f3e9]/65 sm:ml-auto">
                A transfer or bonafide certificate issued by this school carries a code. Enter it to
                confirm the certificate is genuine.
              </p>
              <Link
                href="/verify/enter"
                className="mt-3 inline-block border-b border-[#c9a227]/60 pb-0.5 text-[13.5px] font-semibold text-[#f6f3e9] hover:border-[#c9a227]"
              >
                Check a certificate
              </Link>
            </div>
          </div>

          <div className="rule-gold mt-8 opacity-30" />
          <p className="mt-4 text-[11.5px] text-[#f6f3e9]/45">
            This page is published by the school from its own records, and runs on Flanca.
          </p>
        </div>
      </footer>
    </div>
  );
}

/**
 * A school's stored address usually already contains the city and state, so
 * appending them again reads as a stutter. Only add what is missing.
 */
function locationLine(address: string | null, city: string | null, state: string | null): string {
  const parts = [address].filter(Boolean) as string[];
  const haystack = (address ?? "").toLowerCase();

  for (const extra of [city, state]) {
    if (extra && !haystack.includes(extra.toLowerCase())) parts.push(extra);
  }

  return parts.join(" · ");
}

function Credential({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="plaque text-[#f6f3e9]/50">{label}</dt>
      <dd className="tnum mt-1 text-[14px] font-semibold text-[#f6f3e9]">{value}</dd>
    </div>
  );
}

function Figure({ value, label, small }: { value: string; label: string; small?: boolean }) {
  return (
    <div>
      <dd className={`display ${small ? "text-[20px]" : "text-[30px]"} leading-none`}>{value}</dd>
      <dt className="plaque mt-2 text-[var(--ink-3)]">{label}</dt>
    </div>
  );
}
