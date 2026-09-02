import Link from "next/link";
import { Printer, ScrollText, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { CERTIFICATE_TYPES, certificateMeta } from "@/lib/core/certificate-core";
import { peekNumber } from "@/lib/sequence";
import { Badge, ButtonLink, Card, CardHead, Empty, PageHead, Stat } from "@/components/ui/primitives";

export const metadata = { title: "Certificates — Flanca" };

export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const actor = await requireRole(...OFFICE);
  const sp = await searchParams;

  const [certificates, counts, nextSerials] = await Promise.all([
    db.certificate.findMany({
      where: {
        schoolId: actor.schoolId,
        ...(sp.type ? { type: sp.type as never } : {}),
      },
      orderBy: { issuedOn: "desc" },
      take: 60,
      include: {
        student: {
          select: {
            id: true, name: true, admissionNumber: true,
            class: { select: { name: true } },
          },
        },
      },
    }),
    db.certificate.groupBy({ by: ["type"], where: { schoolId: actor.schoolId }, _count: true }),
    Promise.all(
      CERTIFICATE_TYPES.map(async (t) => ({
        type: t.value,
        next: await peekNumber(actor.schoolId, t.sequenceKind),
      })),
    ),
  ]);

  const countByType = new Map(counts.map((c) => [c.type, c._count]));
  const total = counts.reduce((a, c) => a + c._count, 0);
  const nextByType = new Map(nextSerials.map((n) => [n.type, n.next]));

  return (
    <>
      <PageHead
        eyebrow="Students"
        title="Certificates"
        sub="Transfer, bonafide, character and the rest — each with its own unbroken serial sequence and a public verification page the receiving school can check."
        actions={
          <ButtonLink href="/app/certificates/new" size="sm">
            <ScrollText className="size-4" /> Issue a certificate
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Issued this year" value={total} sub="across all types" />
        <Stat
          label="Transfer certificates"
          value={countByType.get("TRANSFER") ?? 0}
          sub={`next serial ${nextByType.get("TRANSFER") ?? "TC/0001"}`}
        />
        <Stat
          label="Bonafide"
          value={countByType.get("BONAFIDE") ?? 0}
          sub={`next serial ${nextByType.get("BONAFIDE") ?? "BC/0001"}`}
        />
        <Stat
          label="Cancelled"
          value={certificates.filter((c) => c.cancelledAt).length}
          sub="serial retired, never reused"
        />
      </div>

      <div className="mt-5 mb-4 flex flex-wrap gap-1.5">
        <Link
          href="/app/certificates"
          className={
            !sp.type
              ? "rounded-full bg-brand-light px-3 py-1 text-[13px] font-semibold text-brand-ink"
              : "rounded-full px-3 py-1 text-[13px] font-medium text-ink-3 hover:bg-paper-2 hover:text-ink"
          }
        >
          All
        </Link>
        {CERTIFICATE_TYPES.map((t) => (
          <Link
            key={t.value}
            href={`/app/certificates?type=${t.value}`}
            className={
              sp.type === t.value
                ? "rounded-full bg-brand-light px-3 py-1 text-[13px] font-semibold text-brand-ink"
                : "rounded-full px-3 py-1 text-[13px] font-medium text-ink-3 hover:bg-paper-2 hover:text-ink"
            }
          >
            {t.short}
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHead
          title="Issued certificates"
          hint="Serial numbers run in an unbroken sequence — that is what an auditor checks."
        />
        {certificates.length === 0 ? (
          <Empty
            title="No certificates issued yet"
            hint="Issue a bonafide or transfer certificate and it will appear here with its serial."
            action={
              <ButtonLink href="/app/certificates/new" size="sm">
                <ScrollText className="size-4" /> Issue a certificate
              </ButtonLink>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="ruled w-full min-w-[760px]">
              <thead>
                <tr>
                  <th>Serial</th>
                  <th>Type</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Issued</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {certificates.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Serial" className="font-mono text-[12.5px] whitespace-nowrap">{c.serialNo}</td>
                    <td data-label="Type" className="whitespace-nowrap">{certificateMeta(c.type).short}</td>
                    <td data-title>
                      <Link
                        href={`/app/students/${c.student.id}`}
                        className="font-medium hover:text-brand hover:underline"
                      >
                        {c.student.name}
                      </Link>
                      <p className="font-mono text-[11.5px] text-ink-3">{c.student.admissionNumber}</p>
                    </td>
                    <td data-label="Class" className="whitespace-nowrap text-ink-2">{c.student.class?.name ?? "—"}</td>
                    <td data-label="Issued" className="whitespace-nowrap text-ink-2">
                      {c.issuedOn.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                    </td>
                    <td data-label="Status">
                      {c.cancelledAt ? (
                        <Badge tone="bad">Cancelled</Badge>
                      ) : (
                        <Badge tone="good">
                          <ShieldCheck className="size-3" /> Valid
                        </Badge>
                      )}
                    </td>
                    <td data-label="">
                      <Link
                        href={`/app/certificates/${c.id}`}
                        className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
                      >
                        <Printer className="size-3.5" /> Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
