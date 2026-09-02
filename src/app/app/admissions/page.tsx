import Link from "next/link";
import { ExternalLink, Phone, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { getClassOptions } from "@/lib/queries/students";
import { Card, CardHead, Empty, PageHead, Stat } from "@/components/ui/primitives";
import { ApplicationRow } from "./application-row";
import { EnquiryRow } from "./enquiry-row";

export const metadata = { title: "Admissions — Flanca" };

export default async function AdmissionsPage() {
  const actor = await requireRole(...OFFICE);

  const [school, applications, enquiries, classes] = await Promise.all([
    db.school.findUnique({ where: { id: actor.schoolId }, select: { slug: true } }),
    db.application.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { submittedAt: "desc" },
      take: 60,
    }),
    db.enquiry.findMany({
      where: { schoolId: actor.schoolId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    getClassOptions(actor.schoolId),
  ]);

  const open = applications.filter(
    (a) => !["ENROLLED", "REJECTED", "WITHDRAWN"].includes(a.status),
  );
  const fromWebsite = enquiries.filter((e) => e.source === "WEBSITE").length;

  return (
    <>
      <PageHead
        eyebrow="Students"
        title="Admissions"
        sub="Applications from the school's own public page and enquiries taken at the front office, in one queue."
        actions={
          school ? (
            <Link
              href={`/s/${school.slug}`}
              target="_blank"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-2 bg-white px-3 text-[13px] font-semibold hover:bg-paper-2"
            >
              <ExternalLink className="size-4" /> View the public page
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Open applications" value={open.length} tone={open.length > 0 ? "warn" : "good"} sub="awaiting a decision" />
        <Stat
          label="Admitted this year"
          value={applications.filter((a) => a.status === "ENROLLED").length}
          tone="good"
          sub="from an online application"
          icon={<UserPlus className="size-4" />}
        />
        <Stat
          label="Enquiries"
          value={enquiries.filter((e) => e.status === "NEW" || e.status === "CONTACTED").length}
          sub="still to follow up"
          icon={<Phone className="size-4" />}
        />
        <Stat label="From the website" value={fromWebsite} sub="no phone call needed" />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <CardHead
            title="Applications"
            hint="Open a row to move it along. Whatever you write in the note is what the parent sees on their tracking page."
          />
          {applications.length === 0 ? (
            <Empty
              title="No applications yet"
              hint="Share the school's public page and applications will land here."
            />
          ) : (
            <ul className="divide-y divide-line">
              {applications.map((a) => (
                <ApplicationRow
                  key={a.id}
                  classes={classes.map((c) => ({ id: c.id, name: c.name }))}
                  row={{
                    id: a.id,
                    applicationNo: a.applicationNo,
                    studentName: a.studentName,
                    classSought: a.classSought,
                    parentName: a.parentName,
                    phone: a.phone,
                    status: a.status,
                    previousSchool: a.previousSchool,
                    documentsNote: a.documentsNote,
                    reviewNote: a.reviewNote,
                    submittedAt: a.submittedAt.toISOString(),
                    enrolled: Boolean(a.enrolledStudentId),
                  }}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHead title="Enquiries" hint="Walk-ins, phone calls and website forms" />
          {enquiries.length === 0 ? (
            <Empty title="No enquiries" />
          ) : (
            <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
              {enquiries.map((e) => (
                <EnquiryRow
                  key={e.id}
                  row={{
                    id: e.id,
                    studentName: e.studentName,
                    classSought: e.classSought,
                    parentName: e.parentName,
                    phone: e.phone,
                    status: e.status,
                    notes: e.notes,
                    source: e.source,
                    createdAt: e.createdAt.toISOString(),
                  }}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
