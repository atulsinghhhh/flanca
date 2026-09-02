import Link from "next/link";
import {
  AlertTriangle, ArrowRight, BadgeCheck, CalendarDays, ClipboardCheck, Coins,
  ShieldCheck, UserPlus, Users,
} from "lucide-react";
import { requireActor, currentSchool, hasRole } from "@/lib/session";
import { TeacherHome } from "@/components/home/teacher-home";
import { ParentHome } from "@/components/home/parent-home";
import { StudentHome } from "@/components/home/student-home";
import { getOverview } from "@/lib/queries/dashboard";
import { formatMoney } from "@/lib/core/money";
import { formatPercent } from "@/lib/core/grading-core";
import { Badge, ButtonLink, Card, CardHead, Meter, PageHead, Stat } from "@/components/ui/primitives";
import { AgeingBar, CollectionSpark } from "@/components/ui/spark";

export const metadata = { title: "Overview — Flanca" };

const TODAY = new Date();

/**
 * One entry point, four different homes.
 *
 * A teacher opening the app should see the sections they must mark, not the
 * school's cash position; a parent should see their own children and nothing
 * else. Role is decided here rather than by asking people to find the right URL.
 */
export default async function OverviewPage() {
  const actor = await requireActor();

  if (!hasRole(actor, "OWNER", "PRINCIPAL", "ADMIN", "ACCOUNTANT")) {
    if (hasRole(actor, "PARENT")) {
      return <ParentHome schoolId={actor.schoolId} userId={actor.id} name={actor.name} />;
    }
    if (hasRole(actor, "STUDENT")) {
      return <StudentHome schoolId={actor.schoolId} userId={actor.id} name={actor.name} />;
    }
    if (hasRole(actor, "TEACHER")) {
      return <TeacherHome schoolId={actor.schoolId} userId={actor.id} name={actor.name} />;
    }
  }

  const school = await currentSchool(actor.schoolId);
  const o = await getOverview(actor.schoolId, TODAY);

  const freezeSoon = o.compliance.daysToFreeze <= 60 && o.compliance.apaar.blocking > 0;

  return (
    <>
      <PageHead
        eyebrow={TODAY.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        title={`Good ${TODAY.getHours() < 12 ? "morning" : TODAY.getHours() < 17 ? "afternoon" : "evening"}, ${firstName(actor.name)}`}
        sub={`${school.name} · ${o.studentCount} students · ${o.staffCount} staff`}
        actions={
          <>
            <ButtonLink href="/app/attendance" variant="secondary" size="sm">
              <ClipboardCheck className="size-4" /> Attendance
            </ButtonLink>
            <ButtonLink href="/app/fees/collect" size="sm">
              <Coins className="size-4" /> Collect fee
            </ButtonLink>
          </>
        }
      />

      {/* ── the one thing that is actually urgent this month ── */}
      {freezeSoon ? (
        <Link
          href="/app/apaar"
          className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-marigold/35 bg-marigold-light px-4 py-3 transition-colors hover:border-marigold/60"
        >
          <AlertTriangle className="size-5 shrink-0 text-marigold-ink" />
          <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-marigold-ink-strong">
            <strong className="font-semibold">
              {o.compliance.apaar.blocking} student{o.compliance.apaar.blocking === 1 ? "" : "s"} still
              without an APAAR ID
            </strong>{" "}
            — UDISE+ certification freezes in {o.compliance.daysToFreeze} days (30 September). Students
            without an ID block the school's certification.
          </p>
          <span className="flex items-center gap-1 text-[13px] font-semibold text-marigold-ink">
            Open APAAR centre <ArrowRight className="size-3.5" />
          </span>
        </Link>
      ) : null}

      {/* ── top row: the numbers that matter before 10am ── */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Collected this year"
          value={formatMoney(o.money.collected)}
          sub={`of ${formatMoney(o.money.billed)} billed · ${formatPercent(o.money.collectedBp, 1)}`}
          icon={<Coins className="size-4" />}
          href="/app/fees"
        />
        <Stat
          label="Overdue"
          value={formatMoney(o.money.overdue)}
          tone={o.money.overdue > 0 ? "bad" : "good"}
          sub={o.money.defaulters > 0 ? `${o.money.defaulters} students past due date` : "Nothing past due"}
          icon={<AlertTriangle className="size-4" />}
          href="/app/fees?filter=overdue"
        />
        <Stat
          label="Present today"
          value={o.attendance.marked > 0 ? formatPercent(o.attendance.percentBp, 1) : "Not marked"}
          tone={o.attendance.marked === 0 ? "warn" : o.attendance.percentBp >= 9000 ? "good" : "neutral"}
          sub={
            o.attendance.marked > 0
              ? `${o.attendance.present} present · ${o.attendance.absent} absent · ${o.attendance.sectionsMarked}/${o.sectionCount} sections marked`
              : `${o.sectionCount} sections still to mark`
          }
          icon={<ClipboardCheck className="size-4" />}
          href="/app/attendance"
        />
        <Stat
          label="APAAR coverage"
          value={formatPercent(o.compliance.apaar.coverageBp, 1)}
          tone={o.compliance.apaar.canCertify ? "good" : "warn"}
          sub={
            o.compliance.apaar.canCertify
              ? "Every student has an ID — you can certify"
              : `${o.compliance.apaar.blocking} blocking certification`
          }
          icon={<BadgeCheck className="size-4" />}
          href="/app/apaar"
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-3">
        {/* ── money detail ── */}
        <Card className="lg:col-span-2">
          <CardHead
            title="Fee collection"
            hint="Every rupee shown here is itemised head-wise on the parent's invoice — no hidden convenience fee."
            action={
              <Link href="/app/fees" className="text-[13px] font-semibold text-brand hover:underline">
                Dues report
              </Link>
            }
          />
          <div className="grid gap-5 px-5 py-4 sm:grid-cols-2">
            <div>
              <p className="eyebrow text-ink-3">Collection, last 14 days</p>
              <div className="mt-2">
                <CollectionSpark data={o.money.trend} />
              </div>
              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <p className="eyebrow text-ink-3">Of billed</p>
                  <p className="tnum text-[13px] font-semibold">{formatPercent(o.money.collectedBp, 1)}</p>
                </div>
                <Meter valueBp={o.money.collectedBp} tone="good" className="mt-1.5" />
              </div>
            </div>
            <div>
              <p className="eyebrow text-ink-3">Outstanding by age</p>
              <p className="mt-1 font-display text-[22px] font-semibold tnum">
                {formatMoney(o.money.outstanding)}
              </p>
              <div className="mt-3">
                <AgeingBar buckets={o.money.buckets} />
              </div>
            </div>
          </div>
        </Card>

        {/* ── school timetable, right now ── */}
        <Card>
          <CardHead
            title="School Timetable — Today"
            hint={o.timetableToday.currentPeriod ? "In session" : "No period running"}
            action={
              <Link href="/app/timetable" className="text-[13px] font-semibold text-brand hover:underline">
                Full timetable
              </Link>
            }
          />
          <div className="px-5 py-4">
            {o.timetableToday.currentPeriod ? (
              <>
                <p className="eyebrow text-ink-3">Currently in session</p>
                <p className="mt-1 font-display text-[22px] font-semibold tnum">
                  Period {o.timetableToday.currentPeriod}
                </p>
                <p className="mt-1 text-[12.5px] text-ink-3">
                  {o.timetableToday.sectionsInSession} section{o.timetableToday.sectionsInSession === 1 ? "" : "s"} in class right now
                </p>
              </>
            ) : (
              <p className="text-[13px] text-ink-3">Outside school hours, or a break between periods.</p>
            )}
          </div>
          <dl className="divide-y divide-line border-t border-line">
            <Row
              label="Teachers on leave without cover"
              value={o.timetableToday.staffAttendanceTaken ? String(o.timetableToday.uncoveredNow) : "—"}
              tone={o.timetableToday.uncoveredNow > 0 ? "bad" : "good"}
            />
            <Row label="Staff present" value={`${o.staffPresentToday} / ${o.staffCount}`} />
            <Row label="Books not returned" value={String(o.library.unreturnedBooks)} />
          </dl>
        </Card>
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-3">
        {/* ── compliance ── */}
        <Card>
          <CardHead
            title="Compliance"
            hint="The two deadlines nobody else is tracking for you"
            action={<Badge tone={o.compliance.apaar.canCertify ? "good" : "warn"}>
              {o.compliance.daysToFreeze > 0 ? `${o.compliance.daysToFreeze}d to freeze` : "Freeze passed"}
            </Badge>}
          />
          <div className="space-y-4 px-5 py-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                  <BadgeCheck className="size-4 text-brand" /> APAAR IDs
                </p>
                <p className="tnum text-[13px] font-semibold">
                  {o.compliance.apaar.issued}/{o.compliance.apaar.total}
                </p>
              </div>
              <Meter
                valueBp={o.compliance.apaar.coverageBp}
                tone={o.compliance.apaar.canCertify ? "good" : "warn"}
                className="mt-2"
              />
              <ul className="mt-2.5 space-y-1 text-[12.5px] text-ink-2">
                {(
                  [
                    ["MISMATCH", "Aadhaar name mismatch"],
                    ["CONSENT_PENDING", "Consent not collected"],
                    ["CONSENT_REFUSED", "Parent refused"],
                    ["SUBMITTED", "Awaiting UDISE+"],
                  ] as const
                ).map(([key, label]) =>
                  o.compliance.apaar.byState[key] > 0 ? (
                    <li key={key} className="flex justify-between">
                      <span>{label}</span>
                      <span className="tnum font-semibold">{o.compliance.apaar.byState[key]}</span>
                    </li>
                  ) : null,
                )}
              </ul>
            </div>

            <div className="border-t border-line pt-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                  <ShieldCheck className="size-4 text-brand" /> DPDP consent
                </p>
                <p className="tnum text-[13px] font-semibold">{o.compliance.consentPending} pending</p>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">
                Verifiable parental consent is required before processing a child's data. Consent
                Manager rules commence 13 Nov 2026.
              </p>
              <Link href="/app/consent" className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
                Open consent register <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </Card>

        {/* ── admissions ── */}
        <Card>
          <CardHead
            title="Admissions"
            hint="From your public school page and the front office"
            action={
              <Link href="/app/admissions" className="text-[13px] font-semibold text-brand hover:underline">
                Open
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-4 px-5 py-4">
            <div>
              <p className="eyebrow text-ink-3">Open enquiries</p>
              <p className="mt-1 font-display text-[26px] font-semibold tnum">{o.admissions.newEnquiries}</p>
              <p className="mt-0.5 text-[12px] text-ink-3">awaiting follow-up</p>
            </div>
            <div>
              <p className="eyebrow text-ink-3">Applications</p>
              <p className="mt-1 font-display text-[26px] font-semibold tnum">{o.admissions.openApplications}</p>
              <p className="mt-0.5 text-[12px] text-ink-3">in review</p>
            </div>
          </div>
          <div className="border-t border-line px-5 py-3">
            <Link
              href={`/s/${school.slug}`}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
            >
              <UserPlus className="size-4" /> View your public school page
            </Link>
            <p className="mt-1 text-[12px] text-ink-3">
              Parents enquire, apply and track their application without calling the office.
            </p>
          </div>
        </Card>

        {/* ── calendar ── */}
        <Card>
          <CardHead title="Coming up" hint="Shared with parents on the school calendar" />
          {o.upcomingEvents.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-ink-3">Nothing scheduled yet.</div>
          ) : (
            <ul className="divide-y divide-line">
              {o.upcomingEvents.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="mt-0.5 w-11 shrink-0 rounded-md border border-line bg-paper-2 py-1 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                      {e.startDate.toLocaleDateString("en-IN", { month: "short" })}
                    </p>
                    <p className="tnum text-[15px] font-semibold leading-tight">{e.startDate.getUTCDate()}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium leading-snug">{e.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-ink-3">
                      {e.kind.charAt(0) + e.kind.slice(1).toLowerCase()}
                      {e.endDate ? ` · until ${e.endDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const color =
    tone === "good" ? "text-good" : tone === "bad" ? "text-overdue" : tone === "warn" ? "text-marigold-ink" : "";
  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <dt className="text-[13.5px] text-ink-2">{label}</dt>
      <dd className={`tnum text-[14px] font-semibold ${color}`}>{value}</dd>
    </div>
  );
}

/** "Dr. Sushma Nair" → "Sushma". Nobody wants to be greeted by their surname. */
function firstName(full: string): string {
  const parts = full
    .split(" ")
    .filter((p) => !/^(dr|mr|mrs|ms|smt|shri)\.?$/i.test(p));
  return parts[0] ?? full;
}
