import Link from "next/link";
import { BookOpen, CalendarDays, Coins, Megaphone, MessageSquare, ShieldCheck, TriangleAlert } from "lucide-react";
import { getParentHome } from "@/lib/queries/role-home";
import { TutorParentPanel } from "@/components/tutor/panels";
import { formatMoney } from "@/lib/core/money";
import { formatPercent } from "@/lib/core/grading-core";
import { outstandingOf } from "@/lib/core/fees-core";
import { Badge, Card, CardHead, Empty, Meter, PageHead } from "@/components/ui/primitives";

const DATE = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

type LineItem = { head: string; amount: number; concession?: number };

/**
 * A parent's home.
 *
 * The market's loudest parent complaint is that fees appear as one number with
 * no breakdown, so the invoice here is itemised head-wise and states plainly
 * that there is no convenience fee.
 */
export async function ParentHome({
  schoolId,
  userId,
  name,
}: {
  schoolId: string;
  userId: string;
  name: string;
}) {
  const home = await getParentHome(schoolId, userId);

  return (
    <>
      <PageHead
        eyebrow="Parent"
        title={`Namaste, ${name.split(" ")[0]}`}
        sub={
          home.children.length === 1
            ? `${home.children[0].name} · ${home.children[0].className}`
            : `${home.children.length} children at this school`
        }
      />

      {home.children.length === 0 ? (
        <Card>
          <Empty
            title="No children linked to this account"
            hint="Ask the school office to link your child to your login."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {home.children.map((child) => (
            <div key={child.id}>
            <Card className="overflow-hidden">
              <CardHead
                title={child.name}
                hint={`${child.className}${child.classTeacher ? ` · class teacher ${child.classTeacher}` : ""} · ${child.admissionNumber}`}
                action={
                  <span className="flex items-center gap-3">
                    {child.classTeacherUserId ? (
                      <Link
                        href={`/app/chat/new?to=${child.classTeacherUserId}&student=${child.id}`}
                        className="flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:text-brand-dark"
                      >
                        <MessageSquare className="size-3.5" /> Message the class teacher
                      </Link>
                    ) : null}
                    {child.dues.total > 0 ? (
                      <Badge tone={child.dues.overdue > 0 ? "bad" : "warn"}>
                        {formatMoney(child.dues.total)} due
                      </Badge>
                    ) : (
                      <Badge tone="good">
                        <ShieldCheck className="size-3" /> Fees clear
                      </Badge>
                    )}
                  </span>
                }
              />

              <div className="grid gap-5 px-5 py-4 lg:grid-cols-3">
                {/* ── fees, itemised ── */}
                <div className="lg:col-span-2">
                  <p className="eyebrow text-ink-3 mb-2 flex items-center gap-1.5">
                    <Coins className="size-3.5" /> Fees
                  </p>

                  {child.invoices.length === 0 ? (
                    <p className="rounded-md border border-good/25 bg-good-light px-3 py-2.5 text-[13px] text-good">
                      Everything is paid. Receipts are with the school office.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {child.invoices.map((inv) => {
                        const lines = (inv.lineItems ?? []) as LineItem[];
                        const balance = outstandingOf(inv);
                        const overdue = inv.dueDate < new Date();

                        return (
                          <div key={inv.id} className="rounded-lg border border-line bg-white">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3.5 py-2">
                              <div>
                                <p className="text-[13.5px] font-semibold">{inv.label ?? "School fee"}</p>
                                <p className="text-[11.5px] text-ink-3">
                                  Invoice {inv.invoiceNumber} · due {DATE(inv.dueDate)}
                                </p>
                              </div>
                              <p className={`tnum text-[16px] font-bold ${overdue ? "text-overdue" : ""}`}>
                                {formatMoney(balance)}
                              </p>
                            </div>

                            {lines.length > 0 ? (
                              <>
                                <p className="px-3.5 pt-2.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                                  What this is for
                                </p>
                                <ul className="px-3.5 py-1.5">
                                  {lines.map((l, i) => (
                                    <li
                                      key={`${l.head}-${i}`}
                                      className="flex justify-between gap-3 py-[3px] text-[12.5px]"
                                    >
                                      <span className="text-ink-2">{l.head}</span>
                                      <span className="tnum">
                                        {formatMoney(l.amount)}
                                        {l.concession ? (
                                          <span className="ml-1.5 text-good">− {formatMoney(l.concession)}</span>
                                        ) : null}
                                      </span>
                                    </li>
                                  ))}
                                  <li className="mt-1 flex justify-between gap-3 border-t border-line pt-1.5 text-[13px] font-semibold">
                                    <span>Total</span>
                                    <span className="tnum">{formatMoney(inv.amount)}</span>
                                  </li>
                                </ul>
                              </>
                            ) : null}

                            <p className="flex items-start gap-2 border-t border-line bg-good-light/60 px-3.5 py-2 text-[12px] leading-snug text-good">
                              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                              You pay exactly {formatMoney(balance)} — no convenience fee, no hidden
                              charges.
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── attendance & result ── */}
                <div className="space-y-4">
                  <div>
                    <p className="eyebrow text-ink-3 mb-1.5">Attendance</p>
                    <p className="font-display text-[24px] font-semibold tnum">
                      {formatPercent(child.attendance.percentBp, 1)}
                    </p>
                    <Meter
                      valueBp={child.attendance.percentBp}
                      tone={child.eligibility.isShort ? "bad" : "good"}
                      className="mt-1.5"
                    />
                    <p className="mt-1 text-[11.5px] text-ink-3">
                      {child.attendance.presentDays} of {child.attendance.workingDays} working days
                    </p>
                    {child.eligibility.isShort ? (
                      <p className="mt-2 flex items-start gap-1.5 rounded-md bg-overdue-light px-2.5 py-2 text-[11.5px] leading-snug text-overdue">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                        Below the 75% a board exam requires. {child.eligibility.daysNeeded} more days
                        must be attended.
                      </p>
                    ) : null}
                  </div>

                  <div className="border-t border-line pt-3">
                    <p className="eyebrow text-ink-3 mb-1.5">Latest result</p>
                    {child.latestCard ? (
                      <>
                        {child.latestCard.percentage != null ? (
                          <>
                            <p className="font-display text-[24px] font-semibold tnum">
                              {formatPercent(child.latestCard.percentage, 1)}
                            </p>
                            <p className="mt-0.5 text-[12px] text-ink-3">
                              {child.latestCard.examTerm?.name} · grade {child.latestCard.grade ?? "—"} ·
                              rank {child.latestCard.rankInClass ?? "—"}
                            </p>
                          </>
                        ) : (
                          <p className="text-[13px] text-ink-2">
                            {child.latestCard.examTerm?.name ?? "Report card"} is ready — graded holistically,
                            no marks or rank for this class.
                          </p>
                        )}
                        <Link
                          href={`/app/report-cards/${child.latestCard.id}`}
                          className="mt-1.5 inline-block text-[13px] font-semibold text-brand hover:underline"
                        >
                          See the report card
                        </Link>
                      </>
                    ) : (
                      <p className="text-[13px] text-ink-3">Nothing published yet.</p>
                    )}
                  </div>

                  {child.homeworkDue.length > 0 ? (
                    <div className="border-t border-line pt-3">
                      <p className="eyebrow text-ink-3 mb-1.5 flex items-center gap-1.5">
                        <BookOpen className="size-3.5" /> Homework due
                      </p>
                      <ul className="space-y-1.5">
                        {child.homeworkDue.map((h) => (
                          <li key={h.id}>
                            <Link
                              href={`/app/homework/${h.id}`}
                              className="block text-[12.5px] hover:text-brand"
                            >
                              {h.title}
                              <span className="text-ink-3">
                                {" "}
                                · {h.subject?.name ?? "—"} · due {DATE(h.dueOn)}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {child.upcomingExams.length > 0 ? (
                    <div className="border-t border-line pt-3">
                      <p className="eyebrow text-ink-3 mb-1.5 flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" /> Exam date sheet
                      </p>
                      <ul className="space-y-1.5">
                        {child.upcomingExams.map((e) => (
                          <li key={e.id} className="text-[12.5px]">
                            <span className="font-medium">{e.subjectName}</span>
                            <span className="text-ink-3">
                              {" "}
                              · {e.termName} · {DATE(e.examDate)}
                              {e.startTime ? ` at ${e.startTime}` : ""}
                              {e.roomNo ? ` · Room ${e.roomNo}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {child.booksOut.length > 0 ? (
                    <div className="border-t border-line pt-3">
                      <p className="eyebrow text-ink-3 mb-1.5">Library</p>
                      <ul className="space-y-1">
                        {child.booksOut.map((b, i) => (
                          <li key={i} className="text-[12.5px]">
                            {b.title}
                            <span className="text-ink-3"> · due {DATE(b.dueOn)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
            {/* Their own child only, and nothing when the school has no tutor. */}
            <TutorParentPanel schoolId={schoolId} parentUserId={userId} studentId={child.id} />
            </div>
          ))}

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Card>
              <CardHead title="From the school" action={<Megaphone className="size-4 text-ink-3" />} />
              {home.circulars.length === 0 ? (
                <Empty title="No notices yet" />
              ) : (
                <ul className="divide-y divide-line">
                  {home.circulars.map((c) => (
                    <li key={c.id} className="px-5 py-3">
                      <p className="text-[13.5px] font-semibold">{c.title}</p>
                      <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{c.body}</p>
                      <p className="mt-1 flex items-center gap-2.5 text-[11px] text-ink-3">
                        {DATE(c.publishedAt)}
                        {c.createdBy ? (
                          <Link
                            href={`/app/chat/new?circular=${c.id}`}
                            className="font-semibold text-brand hover:text-brand-dark"
                          >
                            Reply privately
                          </Link>
                        ) : null}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHead title="Dates to remember" action={<CalendarDays className="size-4 text-ink-3" />} />
              {home.events.length === 0 ? (
                <Empty title="Nothing scheduled" />
              ) : (
                <ul className="divide-y divide-line">
                  {home.events.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                      <div className="mt-0.5 w-11 shrink-0 rounded-md border border-line bg-paper-2 py-1 text-center">
                        <p className="text-[10px] font-semibold tracking-wide text-ink-3 uppercase">
                          {e.startDate.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}
                        </p>
                        <p className="tnum text-[15px] font-semibold leading-tight">
                          {e.startDate.getUTCDate()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[13.5px] font-medium">{e.title}</p>
                        <p className="text-[11.5px] text-ink-3">
                          {e.kind.charAt(0) + e.kind.slice(1).toLowerCase()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
