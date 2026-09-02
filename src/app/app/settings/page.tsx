import Link from "next/link";
import { Database, Download, History, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { Card, CardHead, PageHead, Stat } from "@/components/ui/primitives";
import { SchoolForm } from "./school-form";
import { PasswordCard } from "./password-card";

export const metadata = { title: "Settings — Flanca" };

export default async function SettingsPage() {
  const actor = await requireRole(...OFFICE);

  const [school, year, counts] = await Promise.all([
    db.school.findUnique({ where: { id: actor.schoolId } }),
    db.academicYear.findFirst({ where: { schoolId: actor.schoolId, isCurrent: true } }),
    Promise.all([
      db.student.count({ where: { schoolId: actor.schoolId } }),
      db.feeInvoice.count({ where: { schoolId: actor.schoolId } }),
      db.feePayment.count({ where: { schoolId: actor.schoolId } }),
      db.examResult.count({ where: { schoolId: actor.schoolId } }),
      db.auditLog.count({ where: { schoolId: actor.schoolId } }),
    ]),
  ]);

  if (!school) return null;
  const [students, invoices, payments, marks, auditCount] = counts;

  return (
    <>
      <PageHead
        eyebrow="Setup"
        title="Settings"
        sub="The school's own details, and the two promises we make about your data: you can take all of it whenever you like, and every change is on the record."
      />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <CardHead
            title="School details"
            hint={
              year?.name
                ? `Academic year ${year.name}`
                : "No academic year yet — set one before fees, exams or report cards"
            }
            action={
              <Link href="/app/settings/year" className="text-[13px] font-semibold text-brand hover:underline">
                Academic year
              </Link>
            }
          />
          <SchoolForm school={school} />
        </Card>

        <div className="space-y-5">
          <PasswordCard />

          {/* the anti-lock-in promise, made operable */}
          <Card>
            <CardHead title="Your data is yours" action={<ShieldCheck className="size-4 text-brand" />} />
            <div className="px-5 py-4">
              <p className="text-[13px] leading-relaxed text-ink-2">
                Download the entire school as one spreadsheet — students, staff, invoices, payments,
                marks and certificates, each on its own sheet. No charge, no request form, no notice
                period.
              </p>

              <dl className="mt-4 grid grid-cols-2 gap-3">
                <Count label="Students" value={students} />
                <Count label="Invoices" value={invoices} />
                <Count label="Payments" value={payments} />
                <Count label="Marks" value={marks} />
              </dl>

              <a
                href="/app/settings/export"
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand text-[14.5px] font-semibold text-white hover:bg-brand-dark"
              >
                <Download className="size-4" /> Export the whole school
              </a>
              <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
                Lock-in is why schools distrust this market. Refusing to build this would be the
                cheapest possible way to break the promise.
              </p>
            </div>
          </Card>

          <Card>
            <CardHead title="Every change is on the record" action={<History className="size-4 text-ink-3" />} />
            <div className="px-5 py-4">
              <p className="font-display text-[26px] font-semibold tnum">
                {auditCount.toLocaleString("en-IN")}
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                actions logged with who did them and when
              </p>
              <Link
                href="/app/settings/audit"
                className="mt-3 inline-block text-[13.5px] font-semibold text-brand hover:underline"
              >
                Open the audit trail
              </Link>
            </div>
          </Card>

          <Card>
            <CardHead title="Runs on" action={<Database className="size-4 text-ink-3" />} />
            <dl className="divide-y divide-line">
              <Row label="Plan" value={school.status === "TRIAL" ? "Trial" : "School"} />
              <Row
                label="Trial ends"
                value={
                  school.trialEndsAt
                    ? school.trialEndsAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "—"
                }
              />
              <Row label="Student limit" value={`${students} of ${school.studentCap}`} />
              <Row label="Public page" value={`/s/${school.slug}`} />
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-paper-2/50 px-3 py-2">
      <dd className="tnum text-[16px] font-semibold">{value.toLocaleString("en-IN")}</dd>
      <dt className="text-[11px] text-ink-3">{label}</dt>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 px-5 py-2">
      <dt className="text-[12.5px] text-ink-3">{label}</dt>
      <dd className="text-[13px] font-medium">{value}</dd>
    </div>
  );
}
