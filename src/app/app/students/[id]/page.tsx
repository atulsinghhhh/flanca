import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle, BadgeCheck, BookOpen, Bus, Coins, FileText, Pencil, ScrollText,
  ShieldCheck, TriangleAlert, UserRound,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireActor, hasRole, MONEY, OFFICE } from "@/lib/session";
import { getStudent } from "@/lib/queries/students";
import { formatMoney } from "@/lib/core/money";
import { formatPercent } from "@/lib/core/grading-core";
import { nextAction } from "@/lib/core/apaar-core";
import { outstandingOf } from "@/lib/core/fees-core";
import { Badge, ButtonLink, Card, CardHead, Empty, Meter, PageHead, Stat, type Tone } from "@/components/ui/primitives";
import { ConcessionCard } from "../concession-card";
import { TutorProfilePanel } from "@/components/tutor/panels";
import { PaymentHistory } from "@/app/app/fees/payment-history";
import { InvoiceStatusCell } from "@/app/app/fees/invoice-status";
import { LoginReset } from "./login-reset";
import { StatusControl } from "./status-control";

export const metadata = { title: "Student — Flanca" };

const DATE = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const data = await getStudent(actor.schoolId, id);
  if (!data) notFound();

  const { student, fees, attendance, reportCards, results, apaar } = data;

  // Money roles may record a concession; only the office may approve or take one
  // away. An accountant writing down what a family asked for is not the same act as
  // the school deciding to give it.
  const canRecord = hasRole(actor, ...MONEY);
  const canApprove = hasRole(actor, ...OFFICE);
  const concessionTypes = canRecord
    ? await db.concessionType.findMany({
        where: { schoolId: actor.schoolId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, percentage: true, fixedAmount: true, requiresApproval: true },
      })
    : [];
  const latestCard = reportCards[0];
  const attTone: Tone =
    attendance.summary.percentBp >= 8500 ? "good" : attendance.eligibility.isShort ? "bad" : "warn";

  return (
    <>
      <PageHead
        eyebrow={`${student.class?.name ?? "Unassigned"}${student.section ? ` ${student.section.name}` : ""} · Roll ${student.rollNumber ?? "—"} · ${student.admissionNumber}`}
        title={student.name}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={student.status === "ACTIVE" ? "good" : "neutral"}>
              {student.status === "ACTIVE" ? "On roll" : student.status}
            </Badge>
            {canApprove ? <StatusControl studentId={student.id} status={student.status} /> : null}
            {student.section?.classTeacher ? (
              <span className="text-ink-3">Class teacher: {student.section.classTeacher.name}</span>
            ) : null}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/app/students/${student.id}/edit`} variant="secondary" size="sm">
              <Pencil className="size-4" /> Edit
            </ButtonLink>
            <ButtonLink href={`/app/certificates/new?student=${student.id}`} variant="secondary" size="sm">
              <ScrollText className="size-4" /> Certificate
            </ButtonLink>
            <ButtonLink href={`/app/fees/collect?student=${student.id}`} size="sm">
              <Coins className="size-4" /> Collect fee
            </ButtonLink>
          </>
        }
      />

      {/* ── the three numbers a parent phone call is always about ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Outstanding fees"
          value={fees.total === 0 ? "Clear" : formatMoney(fees.total)}
          tone={fees.overdue > 0 ? "bad" : fees.total > 0 ? "warn" : "good"}
          sub={
            fees.overdue > 0
              ? `${formatMoney(fees.overdue)} past the due date`
              : fees.total > 0
                ? "Nothing overdue yet"
                : "All invoices settled"
          }
          icon={<Coins className="size-4" />}
        />
        <Stat
          label="Attendance"
          value={formatPercent(attendance.summary.percentBp, 1)}
          tone={attTone}
          sub={`${attendance.summary.presentDays} of ${attendance.summary.workingDays} working days${attendance.streak >= 2 ? ` · absent ${attendance.streak} days running` : ""}`}
          icon={<UserRound className="size-4" />}
        />
        <Stat
          label={latestCard ? `${latestCard.examTerm?.name ?? "Latest"} result` : "Result"}
          value={latestCard ? formatPercent(latestCard.percentage ?? 0, 1) : "Not published"}
          tone={latestCard && (latestCard.percentage ?? 0) >= 6000 ? "good" : "neutral"}
          sub={
            latestCard
              ? `Grade ${latestCard.grade ?? "—"} · rank ${latestCard.rankInClass ?? "—"} in class`
              : "No published report card yet"
          }
          icon={<FileText className="size-4" />}
        />
      </div>

      {/* ── board eligibility: the warning that must arrive in November, not March ── */}
      {attendance.eligibility.isShort ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-overdue/30 bg-overdue-light px-4 py-3">
          <TriangleAlert className="size-5 shrink-0 text-overdue" />
          <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-overdue-ink">
            <strong className="font-semibold">
              Below the 75% attendance a board exam requires
            </strong>{" "}
            — currently {formatPercent(attendance.summary.percentBp, 1)}.{" "}
            {attendance.eligibility.unreachable
              ? "75% is no longer arithmetically reachable this year. Escalate to the principal."
              : `Must attend ${attendance.eligibility.daysNeeded} of the remaining days to become eligible.`}
          </p>
        </div>
      ) : attendance.eligibility.daysAffordable <= 10 ? (
        <div className="mt-4 rounded-lg border border-marigold/35 bg-marigold-light px-4 py-2.5 text-[13px] text-marigold-ink-strong">
          Attendance is fine today, but only{" "}
          <strong>{attendance.eligibility.daysAffordable} more days</strong> can be missed while
          staying above the 75% board requirement.
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* ─────────── left: identity ─────────── */}
        <div className="space-y-5">
          <Card>
            <CardHead title="Student details" />
            <dl className="divide-y divide-line">
              <Field label="Date of birth" value={DATE(student.dob)} />
              <Field label="Gender" value={student.gender ? title(student.gender) : "—"} />
              <Field label="Blood group" value={student.bloodGroup ?? "—"} />
              <Field label="Category" value={student.category ?? "—"} />
              <Field label="Religion" value={student.religion ?? "—"} />
              <Field label="Mother tongue" value={student.motherTongue ?? "—"} />
              <Field label="Admitted on" value={DATE(student.admissionDate)} />
              <Field label="Address" value={student.address ?? "—"} wrap />
            </dl>
          </Card>

          <Card>
            <CardHead title="Parents & guardians" />
            <dl className="divide-y divide-line">
              <Field label="Father" value={student.fatherName ?? "—"} />
              <Field label="Mother" value={student.motherName ?? "—"} />
              <Field label="Mobile" value={student.guardianPhone ?? "—"} mono />
              <Field label="Email" value={student.guardianEmail ?? "—"} />
            </dl>
            {student.parentLinks.length > 0 ? (
              <div className="border-t border-line px-5 py-3">
                <p className="eyebrow text-ink-3 mb-1.5">Parent app logins</p>
                <ul className="space-y-1 text-[13px]">
                  {student.parentLinks.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-2">
                      <span>{p.user.name}</span>
                      <span className="flex items-baseline gap-2.5">
                        <span className="text-ink-3">{title(p.relation)}</span>
                        <Link
                          href={`/app/chat/new?to=${p.user.id}&student=${student.id}`}
                          className="font-semibold text-brand hover:text-brand-dark"
                        >
                          Message
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="border-t border-line px-5 py-3 text-[12.5px] text-ink-3">
                No parent login created yet, so there is nobody to write to. Create one and the
                office can reach them in the app.
              </div>
            )}
          </Card>

          {canApprove && student.userId ? <LoginReset studentId={student.id} /> : null}

          {/* ── APAAR + DPDP, per student ── */}
          <Card>
            <CardHead title="Compliance" hint="APAAR ID and consent, for this child" />
            <div className="space-y-3 px-5 py-4">
              <div className="flex items-start gap-2.5">
                {apaar.state === "ISSUED" ? (
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-good" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-marigold-ink" />
                )}
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold">
                    {apaar.state === "ISSUED" ? "APAAR ID issued" : "APAAR ID pending"}
                  </p>
                  {student.apaarId ? (
                    <p className="mt-0.5 font-mono text-[12.5px] text-ink-2">{student.apaarId}</p>
                  ) : (
                    <p className="mt-0.5 text-[12.5px] text-ink-2">{nextAction(apaar.state)}</p>
                  )}
                  {student.penNumber ? (
                    <p className="mt-0.5 text-[12px] text-ink-3">PEN {student.penNumber}</p>
                  ) : null}
                </div>
              </div>

              {!apaar.nameCheck.matches ? (
                <div className="rounded-md border border-marigold/30 bg-marigold-light px-3 py-2">
                  <p className="text-[12.5px] font-semibold text-marigold-ink-strong">
                    Aadhaar name check: {apaar.nameCheck.reason}
                  </p>
                  <dl className="mt-1.5 space-y-0.5 text-[12px] text-marigold-ink-strong">
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 opacity-70">School record</dt>
                      <dd className="font-medium">{student.name}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 opacity-70">On Aadhaar</dt>
                      <dd className="font-medium">{student.aadhaarName ?? "not recorded"}</dd>
                    </div>
                  </dl>
                  <p className="mt-1.5 text-[11.5px] text-marigold-ink">
                    UDISE+ rejects APAAR generation on a mismatch. Fix this before submitting.
                  </p>
                </div>
              ) : null}

              <div className="border-t border-line pt-3">
                <p className="eyebrow text-ink-3 mb-1.5 flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5" /> DPDP consent
                </p>
                <ul className="space-y-1 text-[12.5px]">
                  {student.consentRecords.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <span className="text-ink-2">{title(c.purpose.replace(/_/g, " "))}</span>
                      <Badge
                        tone={
                          c.state === "GRANTED"
                            ? "good"
                            : c.state === "REFUSED" || c.state === "WITHDRAWN"
                              ? "bad"
                              : "warn"
                        }
                      >
                        {title(c.state)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          {student.transport.length > 0 ? (
            <Card>
              <CardHead title="Transport" />
              {student.transport.map((t) => (
                <dl key={t.id} className="divide-y divide-line">
                  <Field label="Route" value={t.route.name} />
                  <Field label="Stop" value={t.stop?.name ?? "—"} />
                  <Field label="Pick-up" value={t.stop?.pickupTime ?? "—"} />
                  <Field label="Vehicle" value={t.route.vehicleNo ?? "—"} />
                  <Field label="Driver" value={`${t.route.driverName ?? "—"}${t.route.driverPhone ? ` · ${t.route.driverPhone}` : ""}`} />
                  <Field label="Monthly fee" value={t.stop ? formatMoney(t.stop.monthlyFee) : "—"} />
                </dl>
              ))}
            </Card>
          ) : null}
        </div>

        {/* ─────────── right: activity ─────────── */}
        <div className="space-y-5">
          {canRecord ? (
          <ConcessionCard
            studentId={student.id}
            canApprove={canApprove}
            granted={student.concessions.map((c) => ({
              concessionId: c.id,
              typeName: c.concessionType.name,
              worth:
                c.percentage != null
                  ? `${c.percentage}%`
                  : c.fixedAmount != null
                    ? formatMoney(c.fixedAmount)
                    : c.concessionType.percentage != null
                      ? `${c.concessionType.percentage}%`
                      : formatMoney(c.concessionType.fixedAmount ?? 0),
              approved: Boolean(c.approvedAt),
              note: c.note,
            }))}
            types={concessionTypes.map((t) => ({
              id: t.id,
              name: t.name,
              worth: t.percentage != null ? `${t.percentage}%` : formatMoney(t.fixedAmount ?? 0),
              requiresApproval: t.requiresApproval,
            }))}
          />
          ) : null}

          {/* fees */}
          <Card>
            <CardHead
              title="Fees"
              hint="Every invoice is itemised head-wise. What the parent sees is exactly this."
              action={
                <Link href={`/app/fees/collect?student=${student.id}`} className="text-[13px] font-semibold text-brand hover:underline">
                  Collect
                </Link>
              }
            />
            {fees.invoices.length === 0 ? (
              <Empty title="No invoices raised yet" hint="Assign a fee structure to this class to raise term invoices." />
            ) : (
              <div className="overflow-x-auto">
                <table className="ruled w-full min-w-[620px]">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Term</th>
                      <th>Due</th>
                      <th className="num">Amount</th>
                      <th className="num">Paid</th>
                      <th className="num">Balance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.invoices.map((inv) => {
                      const balance = outstandingOf(inv);
                      const late = balance > 0 && inv.dueDate < new Date();
                      return (
                        <tr key={inv.id}>
                          <td data-title className="font-mono text-[12px] whitespace-nowrap text-ink-2">
                            {inv.invoiceNumber}
                          </td>
                          <td data-label="Term" className="whitespace-nowrap">{inv.label ?? "—"}</td>
                          <td data-label="Due" className={`whitespace-nowrap ${late ? "font-medium text-overdue" : "text-ink-2"}`}>
                            {DATE(inv.dueDate)}
                          </td>
                          <td data-label="Amount" className="num">{formatMoney(inv.amount)}</td>
                          <td data-label="Paid" className="num text-ink-2">{formatMoney(inv.paidAmount)}</td>
                          <td data-label="Balance" className={`num ${balance > 0 ? "font-semibold" : "text-ink-3"}`}>
                            {balance > 0 ? formatMoney(balance) : "—"}
                          </td>
                          <td data-label="Status">
                            <InvoiceStatusCell
                              invoiceId={inv.id}
                              status={inv.status}
                              paidAmount={inv.paidAmount}
                              cancelReason={inv.cancelReason}
                              canCancel={canApprove}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {fees.payments.length > 0 ? (
              <div className="border-t border-line px-5 py-3.5">
                <p className="eyebrow text-ink-3 mb-2">Receipts</p>
                <PaymentHistory
                  canReverse={canRecord}
                  showReprint
                  payments={fees.payments.slice(0, 6).map((p) => ({
                    id: p.id,
                    amount: p.amount,
                    mode: title(p.mode),
                    paidAtLabel: DATE(p.paidAt),
                    receiptId: p.receipt?.id ?? null,
                    receiptNumber: p.receipt?.receiptNumber ?? null,
                    reversedAt: p.reversedAt ? p.reversedAt.toISOString() : null,
                    reverseReason: p.reverseReason,
                  }))}
                />
              </div>
            ) : null}
          </Card>

          {/* attendance */}
          <Card>
            <CardHead
              title="Attendance"
              hint={`${attendance.summary.absentDays} absent · ${attendance.summary.lateDays} late · ${attendance.summary.leaveDays} on leave`}
              action={
                <span className="tnum text-[13px] font-semibold">
                  {formatPercent(attendance.summary.percentBp, 1)}
                </span>
              }
            />
            <div className="px-5 py-4">
              <Meter valueBp={attendance.summary.percentBp} tone={attTone} />
              {attendance.recent.length > 0 ? (
                <>
                  <p className="eyebrow text-ink-3 mt-4 mb-2">Last {attendance.recent.length} marked days</p>
                  <div className="flex flex-wrap gap-1">
                    {[...attendance.recent].reverse().map((a, i) => (
                      <span
                        key={i}
                        title={`${DATE(a.date)} · ${title(a.status)}`}
                        className={`size-5 rounded-[3px] text-[9px] leading-5 text-center font-semibold ${
                          a.status === "PRESENT"
                            ? "bg-good-light text-good"
                            : a.status === "ABSENT"
                              ? "bg-overdue-light text-overdue"
                              : a.status === "LATE"
                                ? "bg-marigold-light text-marigold-ink"
                                : "bg-paper-2 text-ink-3"
                        }`}
                      >
                        {a.status === "PRESENT" ? "P" : a.status === "ABSENT" ? "A" : a.status === "LATE" ? "L" : "—"}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </Card>

          {/* results */}
          <Card>
            <CardHead
              title="Results"
              hint={latestCard ? `${latestCard.examTerm?.name} · published ${DATE(latestCard.publishedAt)}` : "Nothing published yet"}
              action={
                latestCard ? (
                  <Link
                    href={`/app/report-cards/${latestCard.id}`}
                    className="text-[13px] font-semibold text-brand hover:underline"
                  >
                    Report card
                  </Link>
                ) : null
              }
            />
            {results.length === 0 ? (
              <Empty title="No marks published" hint="Marks appear here once a term's results are published." />
            ) : (
              <div className="overflow-x-auto">
                <table className="ruled w-full min-w-[480px]">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Exam</th>
                      <th className="num">Marks</th>
                      <th>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice(0, 12).map((r) => (
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

          <div className="grid gap-5 sm:grid-cols-2">
            {/* conduct */}
            <Card>
              <CardHead title="Conduct & achievements" />
              {student.conductRecords.length === 0 ? (
                <Empty title="Nothing recorded" />
              ) : (
                <ul className="divide-y divide-line">
                  {student.conductRecords.map((c) => (
                    <li key={c.id} className="px-5 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13.5px] font-medium">{c.title}</p>
                        <Badge tone={c.kind === "MERIT" || c.kind === "ACHIEVEMENT" ? "good" : "warn"}>
                          {title(c.kind)}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[12px] text-ink-3">{DATE(c.date)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* library */}
            <Card>
              <CardHead title="Library" hint={`${student.bookIssues.filter((b) => !b.returnedOn).length} not returned`} />
              {student.bookIssues.length === 0 ? (
                <Empty title="No books issued" />
              ) : (
                <ul className="divide-y divide-line">
                  {student.bookIssues.map((b) => (
                    <li key={b.id} className="flex items-start gap-2.5 px-5 py-2.5">
                      <BookOpen className="mt-0.5 size-4 shrink-0 text-ink-3" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{b.book.title}</p>
                        <p className="mt-0.5 text-[12px] text-ink-3">
                          {b.returnedOn ? `Returned ${DATE(b.returnedOn)}` : `Due ${DATE(b.dueOn)}`}
                          {b.fineAmount > 0 ? ` · fine ${formatMoney(b.fineAmount)}${b.finePaid ? " (paid)" : ""}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {student.certificates.length > 0 ? (
            <Card>
              <CardHead title="Certificates issued" />
              <ul className="divide-y divide-line">
                {student.certificates.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div>
                      <p className="text-[13.5px] font-medium">{title(c.type)} certificate</p>
                      <p className="text-[12px] text-ink-3">
                        {c.serialNo} · {DATE(c.issuedOn)}
                      </p>
                    </div>
                    <Link
                      href={`/app/certificates/${c.id}`}
                      className="text-[13px] font-semibold text-brand hover:underline"
                    >
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* The tutor, if the school has one. Same content the parent sees. */}
          <TutorProfilePanel schoolId={actor.schoolId} studentId={student.id} />
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  mono,
  wrap,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className="flex gap-3 px-5 py-2">
      <dt className="w-28 shrink-0 text-[12.5px] text-ink-3">{label}</dt>
      <dd
        className={`text-[13.5px] ${mono ? "font-mono text-[12.5px]" : ""} ${wrap ? "" : "truncate"}`}
      >
        {value}
      </dd>
    </div>
  );
}

const KEEP_UPPER = new Set(["APAAR", "UPI", "DPDP", "TC", "NEFT", "DD", "RTE", "EWS"]);

function title(s: string): string {
  return s
    .split(" ")
    .map((w) =>
      KEEP_UPPER.has(w.toUpperCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}
