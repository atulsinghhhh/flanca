import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { db } from "@/lib/db";
import { isoDay } from "@/lib/queries/when";
import { requireRole, OFFICE } from "@/lib/session";
import { outstandingOf } from "@/lib/core/fees-core";
import { Card, CardHead, Empty, PageHead } from "@/components/ui/primitives";
import { IssueForm } from "./issue-form";

export const metadata = { title: "Issue certificate — Flanca" };

export default async function NewCertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; q?: string; type?: string }>;
}) {
  const actor = await requireRole(...OFFICE);
  const sp = await searchParams;
  const today = isoDay();

  if (!sp.student) {
    const matches = sp.q?.trim()
      ? await db.student.findMany({
          where: {
            schoolId: actor.schoolId,
            OR: [
              { name: { contains: sp.q.trim(), mode: "insensitive" } },
              { admissionNumber: { contains: sp.q.trim(), mode: "insensitive" } },
              { fatherName: { contains: sp.q.trim(), mode: "insensitive" } },
            ],
          },
          orderBy: [{ class: { sequenceOrder: "asc" } }, { name: "asc" }],
          take: 25,
          select: {
            id: true, name: true, admissionNumber: true, status: true,
            class: { select: { name: true } }, section: { select: { name: true } },
          },
        })
      : [];

    return (
      <>
        <Link
          href="/app/certificates"
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" /> Certificates
        </Link>

        <PageHead eyebrow="Students" title="Issue a certificate" sub="Find the student first." />

        <Card className="mx-auto max-w-2xl">
          <CardHead title="Which student?" hint="Search by name, admission number or father's name." />
          <form method="get" className="px-5 py-5">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-3" />
              <input
                name="q"
                defaultValue={sp.q ?? ""}
                autoFocus
                placeholder="Start typing a name or admission number"
                className="h-12 w-full rounded-md border border-line-2 bg-white pr-3 pl-10 text-[15.5px] outline-none focus:border-brand"
              />
            </div>
            <button
              type="submit"
              className="mt-3 h-11 w-full rounded-md bg-brand text-[15px] font-semibold text-white hover:bg-brand-dark"
            >
              Search
            </button>
          </form>

          {sp.q?.trim() ? (
            matches.length === 0 ? (
              <Empty title={`No student matches “${sp.q}”`} />
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {matches.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/app/certificates/new?student=${s.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-brand-light/40"
                    >
                      <div>
                        <p className="text-[14.5px] font-semibold">{s.name}</p>
                        <p className="text-[12.5px] text-ink-3">
                          {s.admissionNumber} · {s.class?.name ?? "—"}
                          {s.section ? ` ${s.section.name}` : ""}
                          {s.status !== "ACTIVE" ? ` · ${s.status.toLowerCase()}` : ""}
                        </p>
                      </div>
                      <span className="text-[13px] font-semibold text-brand">Select</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </Card>
      </>
    );
  }

  const student = await db.student.findFirst({
    where: { id: sp.student, schoolId: actor.schoolId },
    include: {
      class: true,
      section: true,
      invoices: { where: { status: { not: "CANCELLED" } } },
    },
  });

  if (!student) {
    return (
      <Card>
        <Empty title="That student is not on this school's roll" />
      </Card>
    );
  }

  const outstanding = student.invoices.reduce((a, i) => a + outstandingOf(i), 0);

  return (
    <>
      <Link
        href="/app/certificates"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Certificates
      </Link>

      <PageHead
        eyebrow={`${student.admissionNumber} · ${student.class?.name ?? "—"}${student.section ? ` ${student.section.name}` : ""}`}
        title={`Issue a certificate for ${student.name}`}
      />

      <Card className="mx-auto max-w-3xl">
        <IssueForm
          studentId={student.id}
          studentName={student.name}
          outstanding={outstanding}
          today={today}
          defaultType={sp.type ?? "BONAFIDE"}
        />
      </Card>
    </>
  );
}
