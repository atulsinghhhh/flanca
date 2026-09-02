import Link from "next/link";
import { BookOpen, CalendarDays, Clock, FileText, Megaphone } from "lucide-react";
import { getStudentHome } from "@/lib/queries/role-home";
import { TutorStudentEntry } from "@/components/tutor/panels";
import { formatMoney } from "@/lib/core/money";
import { formatPercent } from "@/lib/core/grading-core";
import { Badge, Card, CardHead, Empty, Meter, PageHead, Stat } from "@/components/ui/primitives";

const DATE = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : "—";

/** A student's own day, in their own words. */
export async function StudentHome({
  schoolId,
  userId,
  name,
}: {
  schoolId: string;
  userId: string;
  name: string;
}) {
  const home = await getStudentHome(schoolId, userId);

  if (!home) {
    return (
      <Card>
        <Empty
          title="No student record linked to this login"
          hint="Ask the school office to link your account."
        />
      </Card>
    );
  }

  const today = new Date();

  return (
    <>
      <PageHead
        eyebrow={today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        title={`Hello, ${name.split(" ")[0]}`}
        sub={`${home.student.class?.name ?? "—"}${home.student.section ? ` ${home.student.section.name}` : ""} · Roll ${home.student.rollNumber ?? "—"}${home.student.section?.classTeacher ? ` · ${home.student.section.classTeacher.name}` : ""}`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="My attendance"
          value={formatPercent(home.attendance.percentBp, 1)}
          tone={home.eligibility.isShort ? "bad" : "good"}
          sub={
            home.eligibility.isShort
              ? `${home.eligibility.daysNeeded} more days needed for 75%`
              : `you can miss ${home.eligibility.daysAffordable} more days`
          }
        />
        <Stat
          label="Latest result"
          value={
            home.latestCard
              ? home.latestCard.percentage != null
                ? formatPercent(home.latestCard.percentage, 1)
                : "Ready"
              : "—"
          }
          sub={
            home.latestCard
              ? home.latestCard.percentage != null
                ? `${home.latestCard.examTerm?.name} · rank ${home.latestCard.rankInClass ?? "—"}`
                : `${home.latestCard.examTerm?.name ?? "Report card"} · holistic, no rank`
              : "nothing published yet"
          }
          icon={<FileText className="size-4" />}
        />
        <Stat
          label="Periods today"
          value={home.timetable.length}
          sub={home.timetable[0]?.startTime ? `first at ${home.timetable[0].startTime}` : "no class today"}
          icon={<Clock className="size-4" />}
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHead title="Today's classes" />
            {home.timetable.length === 0 ? (
              <Empty title="No classes today" />
            ) : (
              <ul className="divide-y divide-line">
                {home.timetable.map((t) => (
                  <li key={t.id} className="flex items-center gap-4 px-5 py-2.5">
                    <div className="w-16 shrink-0 text-center">
                      <p className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                        {t.period}
                      </p>
                      <p className="tnum text-[13px] font-semibold">{t.startTime ?? "—"}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium">{t.subject?.name ?? "—"}</p>
                      <p className="text-[12px] text-ink-3">
                        {t.staff?.user.name ?? "—"}
                        {t.roomNo ? ` · room ${t.roomNo}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead title="Recent marks" hint="Only what has been published" />
            {home.results.length === 0 ? (
              <Empty title="No marks published yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="ruled w-full min-w-[420px]">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Exam</th>
                      <th className="num">Marks</th>
                      <th>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {home.results.map((r) => (
                      <tr key={r.id}>
                        <td data-title className="font-medium">{r.exam.subject?.name ?? "—"}</td>
                        <td data-label="Exam" className="text-ink-2">{r.exam.examTerm.name}</td>
                        <td data-label="Marks" className="num">
                          {r.isAbsent ? (
                            <span className="text-overdue">Absent</span>
                          ) : (
                            <>
                              {r.marks ?? "—"}
                              <span className="text-ink-3">/{r.exam.maxMarks}</span>
                            </>
                          )}
                        </td>
                        <td data-label="Grade">{r.grade ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHead title="Homework" action={<BookOpen className="size-4 text-ink-3" />} />
            {home.homework.length === 0 ? (
              <Empty title="Nothing due" hint="Enjoy it while it lasts." />
            ) : (
              <ul className="divide-y divide-line">
                {home.homework.map((h) => (
                  <li key={h.id}>
                    <Link href={`/app/homework/${h.id}`} className="block px-5 py-2.5 hover:bg-paper-2">
                      <p className="text-[13.5px] font-medium">{h.title}</p>
                      <p className="mt-0.5 text-[11.5px] text-ink-3">
                        {h.subject?.name ?? "—"} · due {DATE(h.dueOn)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead title="Exam date sheet" action={<CalendarDays className="size-4 text-ink-3" />} />
            {home.upcomingExams.length === 0 ? (
              <Empty title="Nothing scheduled" hint="Dates appear here as soon as the office sets them." />
            ) : (
              <ul className="divide-y divide-line">
                {home.upcomingExams.map((e) => (
                  <li key={e.id} className="px-5 py-2.5">
                    <p className="text-[13.5px] font-medium">{e.subjectName}</p>
                    <p className="mt-0.5 text-[11.5px] text-ink-3">
                      {e.termName} · {DATE(e.examDate)}
                      {e.startTime ? ` at ${e.startTime}` : ""}
                      {e.roomNo ? ` · Room ${e.roomNo}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead title="My attendance" />
            <div className="px-5 py-4">
              <Meter
                valueBp={home.attendance.percentBp}
                tone={home.eligibility.isShort ? "bad" : "good"}
              />
              <p className="mt-2 text-[12.5px] text-ink-2">
                {home.attendance.presentDays} present · {home.attendance.absentDays} absent ·{" "}
                {home.attendance.lateDays} late
              </p>
            </div>
          </Card>

          {home.dues.total > 0 ? (
            <Card>
              <CardHead title="Fees" />
              <div className="px-5 py-4">
                <p className="font-display text-[22px] font-semibold tnum">
                  {formatMoney(home.dues.total)}
                </p>
                <p className="mt-0.5 text-[12.5px] text-ink-3">
                  outstanding — your parent can see the full breakdown on their login
                </p>
              </div>
            </Card>
          ) : null}

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

          {home.circulars.length > 0 ? (
            <Card>
              <CardHead title="Notices" action={<Megaphone className="size-4 text-ink-3" />} />
              <ul className="divide-y divide-line">
                {home.circulars.map((c) => (
                  <li key={c.id} className="px-5 py-2.5">
                    <p className="text-[13.5px] font-medium">{c.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-2">{c.body}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      {/* The door, not a dashboard. Nothing at all if the school has no tutor. */}
      <TutorStudentEntry studentId={home.student.id} />
    </>
  );
}
