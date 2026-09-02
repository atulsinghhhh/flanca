import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardCheck, Clock, PenLine, ShieldCheck } from "lucide-react";
import { getTeacherHome } from "@/lib/queries/role-home";
import { TutorSectionPanel } from "@/components/tutor/panels";
import { Badge, ButtonLink, Card, CardHead, Empty, Meter, PageHead, Stat } from "@/components/ui/primitives";
import { formatPercent } from "@/lib/core/grading-core";

const DATE = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

/** A teacher's home: only what is theirs to do today. */
export async function TeacherHome({
  schoolId,
  userId,
  name,
}: {
  schoolId: string;
  userId: string;
  name: string;
}) {
  const home = await getTeacherHome(schoolId, userId);
  const today = new Date();
  const unmarked = home.sections.filter((s) => !s.marked);

  return (
    <>
      <PageHead
        eyebrow={today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        title={`Good ${today.getHours() < 12 ? "morning" : today.getHours() < 17 ? "afternoon" : "evening"}, ${name.split(" ")[0]}`}
        sub={
          home.staff
            ? `${home.staff.designation ?? "Teacher"} · ${home.staff.employeeId}`
            : "Teacher"
        }
      />

      {unmarked.length > 0 ? (
        <Link
          href={`/app/attendance/${unmarked[0].id}`}
          className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-marigold/35 bg-marigold-light px-4 py-3 transition-colors hover:border-marigold/60"
        >
          <ClipboardCheck className="size-5 shrink-0 text-marigold-ink" />
          <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-marigold-ink-strong">
            <strong className="font-semibold">
              {unmarked.map((s) => s.label).join(", ")} still needs attendance
            </strong>{" "}
            — one tap per absent student, and it works with no signal.
          </p>
          <span className="flex items-center gap-1 text-[13px] font-semibold text-marigold-ink">
            Mark now <ArrowRight className="size-3.5" />
          </span>
        </Link>
      ) : null}

      {home.examDutyToday.length > 0 ? (
        <div className="mb-5 space-y-2">
          {home.examDutyToday.map((d) => (
            <div
              key={d.examId}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-info/30 bg-info-light px-4 py-3"
            >
              <ShieldCheck className="size-5 shrink-0 text-info" />
              <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-info">
                <strong className="font-semibold">
                  Invigilation duty today{d.roomNo ? ` — Room ${d.roomNo}` : ""}
                </strong>{" "}
                — {d.className} {d.subject}
                {d.startTime ? ` at ${d.startTime}` : ""}.
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="My sections"
          value={home.sections.length}
          sub={
            home.sections.length > 0
              ? `${home.sections.filter((s) => s.marked).length} marked today`
              : "not a class teacher"
          }
          icon={<ClipboardCheck className="size-4" />}
        />
        <Stat
          label="Periods today"
          value={home.timetable.length}
          sub={home.timetable[0]?.startTime ? `first at ${home.timetable[0].startTime}` : "no periods scheduled"}
          icon={<Clock className="size-4" />}
        />
        <Stat
          label="Marks to enter"
          value={home.marksPending.length}
          tone={home.marksPending.length > 0 ? "warn" : "good"}
          sub="papers with entry outstanding"
          icon={<PenLine className="size-4" />}
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHead title="Today's periods" hint="Your timetable for the day" />
            {home.timetable.length === 0 ? (
              <Empty title="No periods today" />
            ) : (
              <ul className="divide-y divide-line">
                {home.timetable.map((t) => (
                  <li key={t.id} className="flex items-center gap-4 px-5 py-2.5">
                    <div className="w-16 shrink-0 text-center">
                      <p className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                        Period {t.period}
                      </p>
                      <p className="tnum text-[13px] font-semibold">{t.startTime ?? "—"}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium">{t.subject?.name ?? "—"}</p>
                      <p className="text-[12px] text-ink-3">
                        {t.class?.name}
                        {t.section ? ` ${t.section.name}` : ""}
                        {t.roomNo ? ` · room ${t.roomNo}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {home.marksPending.length > 0 ? (
            <Card>
              <CardHead
                title="Marks still to enter"
                hint="Type a mark, press Enter, you are on the next student"
              />
              <ul className="divide-y divide-line">
                {home.marksPending.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium">
                        {m.subject} · {m.className}
                      </p>
                      <p className="text-[11.5px] text-ink-3">{m.termName}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="w-24">
                        <Meter
                          valueBp={m.expected > 0 ? Math.round((m.entered / m.expected) * 10000) : 0}
                          tone="warn"
                        />
                        <p className="mt-1 text-right text-[11px] text-ink-3 tnum">
                          {m.entered}/{m.expected}
                        </p>
                      </div>
                      <Link
                        href={`/app/exams/${m.id}`}
                        className="text-[13px] font-semibold text-brand hover:underline"
                      >
                        Enter
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHead
              title="My sections"
              hint="Tap to mark attendance"
              action={
                <ButtonLink href="/app/attendance" variant="secondary" size="sm">
                  All
                </ButtonLink>
              }
            />
            {home.sections.length === 0 ? (
              <Empty title="You are not a class teacher" hint="Subject teaching only." />
            ) : (
              <ul className="divide-y divide-line">
                {home.sections.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/app/attendance/${s.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-brand-light/35"
                    >
                      <div>
                        <p className="text-[14px] font-semibold">{s.label}</p>
                        <p className="text-[11.5px] text-ink-3">{s.strength} students</p>
                      </div>
                      <Badge tone={s.marked ? "good" : "warn"}>{s.marked ? "Marked" : "Pending"}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead title="Homework set" action={<BookOpen className="size-4 text-ink-3" />} />
            {home.homework.length === 0 ? (
              <Empty title="Nothing due" />
            ) : (
              <ul className="divide-y divide-line">
                {home.homework.map((h) => (
                  <li key={h.id} className="px-5 py-2.5">
                    <p className="text-[13.5px] font-medium">{h.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-ink-3">
                      {h.class?.name}
                      {h.section ? ` ${h.section.name}` : ""} · due {DATE(h.dueOn)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {home.booksOut.length > 0 ? (
            <Card>
              <CardHead title="Library books with me" />
              <ul className="divide-y divide-line">
                {home.booksOut.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <p className="min-w-0 truncate text-[13px]">{b.book.title}</p>
                    <Badge tone={b.dueOn < today ? "bad" : "neutral"}>due {DATE(b.dueOn)}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {home.notifications.length > 0 ? (
            <Card>
              <CardHead title="For you" />
              <ul className="divide-y divide-line">
                {home.notifications.map((n) => (
                  <li key={n.id} className="px-5 py-2.5">
                    <p className="text-[13.5px] font-medium">{n.title}</p>
                    <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{n.body}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      {/*
        Her section as the tutor sees it — one panel per section she is class
        teacher of, which is almost always exactly one. Renders nothing at all
        when the school has no tutor, and one honest sentence when it is dark.
      */}
      {home.sections.map((s) => (
        <TutorSectionPanel key={s.id} schoolId={schoolId} sectionId={s.id} />
      ))}
    </>
  );
}
