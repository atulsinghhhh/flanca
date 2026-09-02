import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole, OFFICE } from "@/lib/session";
import { CertificateSheet, type CertificateSnapshot } from "@/components/print/certificate-sheet";
import { PrintButton } from "@/app/app/fees/receipt/print-button";
import { Badge } from "@/components/ui/primitives";
import { CancelButton } from "./cancel-button";

export const metadata = { title: "Certificate — Flanca" };

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole(...OFFICE);
  const { id } = await params;

  const [certificate, school] = await Promise.all([
    db.certificate.findFirst({
      where: { id, schoolId: actor.schoolId },
      include: { student: { select: { id: true, name: true } } },
    }),
    db.school.findUnique({
      where: { id: actor.schoolId },
      select: { name: true, address: true, phone: true, email: true, affiliationNo: true, udiseCode: true },
    }),
  ]);

  if (!certificate || !school) notFound();

  const verifyUrl = `flanca.online/verify/${certificate.verifyToken.slice(0, 8)}`;

  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/app/students/${certificate.student.id}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
          >
            <ArrowLeft className="size-3.5" /> {certificate.student.name}
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2">
            <span className="font-mono">{certificate.serialNo}</span>
            {certificate.cancelledAt ? (
              <Badge tone="bad">Cancelled</Badge>
            ) : (
              <Badge tone="good">
                <ShieldCheck className="size-3" /> Valid
              </Badge>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/verify/${certificate.verifyToken}`}
            target="_blank"
            className="rounded-md border border-line-2 bg-white px-3 py-2 text-[13px] font-semibold hover:bg-paper-2"
          >
            Public verification page
          </Link>
          <PrintButton label="Print certificate" />
          <CancelButton certificateId={certificate.id} cancelled={!!certificate.cancelledAt} />
        </div>
      </div>

      <div className="card overflow-hidden print:border-0 print:shadow-none">
        <CertificateSheet
          school={school}
          type={certificate.type}
          serialNo={certificate.serialNo}
          issuedOn={certificate.issuedOn}
          snapshot={certificate.snapshot as CertificateSnapshot}
          verifyUrl={verifyUrl}
          cancelledAt={certificate.cancelledAt}
        />
      </div>
    </>
  );
}
