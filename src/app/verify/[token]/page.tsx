import { db } from "@/lib/db";
import { CircleSlash, ShieldCheck, ShieldX } from "lucide-react";
import { Mark } from "@/components/shell/mark";
import { certificateMeta } from "@/lib/core/certificate-core";

export const metadata = {
  title: "Verify a certificate — Flanca",
  robots: { index: false },
};

type Snapshot = {
  studentName?: string;
  admissionNumber?: string;
  fatherName?: string | null;
  className?: string | null;
  sectionName?: string | null;
};

/**
 * Public certificate verification.
 *
 * The token is printed on the certificate itself, so whoever holds the paper can
 * confirm it. Nothing beyond what is already on that paper is shown here — a
 * verification page must not become a way to browse a school's students.
 */
export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const certificate = await db.certificate.findUnique({
    where: { verifyToken: token },
    select: {
      type: true,
      serialNo: true,
      issuedOn: true,
      cancelledAt: true,
      snapshot: true,
      school: { select: { name: true, city: true, state: true, udiseCode: true, affiliationNo: true } },
    },
  });

  const snapshot = (certificate?.snapshot ?? {}) as Snapshot;
  const valid = Boolean(certificate) && !certificate?.cancelledAt;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-5 py-12">
      <div className="mb-7 flex items-center gap-2.5">
        <Mark size={26} />
        <span className="font-display text-[19px] font-semibold tracking-[-0.02em]">Flanca</span>
      </div>

      <div className="card w-full max-w-lg overflow-hidden">
        <div
          className={`flex items-center gap-3 px-6 py-5 ${
            !certificate ? "bg-paper-2" : valid ? "bg-good-light" : "bg-overdue-light"
          }`}
        >
          {!certificate ? (
            <CircleSlash className="size-7 shrink-0 text-ink-3" />
          ) : valid ? (
            <ShieldCheck className="size-7 shrink-0 text-good" />
          ) : (
            <ShieldX className="size-7 shrink-0 text-overdue" />
          )}
          <div>
            <h1
              className={`font-display text-[19px] font-semibold ${
                !certificate ? "text-ink-2" : valid ? "text-good" : "text-overdue"
              }`}
            >
              {!certificate
                ? "No certificate found"
                : valid
                  ? "This certificate is genuine"
                  : "This certificate was cancelled"}
            </h1>
            <p className="mt-0.5 text-[13px] text-ink-2">
              {!certificate
                ? "That verification code does not match any certificate we have issued."
                : valid
                  ? "It was issued by the school below and has not been withdrawn."
                  : `Cancelled on ${certificate.cancelledAt!.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}. Do not accept it.`}
            </p>
          </div>
        </div>

        {certificate ? (
          <dl className="divide-y divide-line">
            <Row label="Certificate" value={certificateMeta(certificate.type).label} />
            <Row label="Serial number" value={certificate.serialNo} mono />
            <Row label="Student" value={snapshot.studentName ?? "—"} bold />
            <Row label="Admission number" value={snapshot.admissionNumber ?? "—"} mono />
            <Row label="Father / Guardian" value={snapshot.fatherName ?? "—"} />
            <Row
              label="Class"
              value={`${snapshot.className ?? "—"}${snapshot.sectionName ? ` ${snapshot.sectionName}` : ""}`}
            />
            <Row
              label="Date of issue"
              value={certificate.issuedOn.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            />
            <Row
              label="Issued by"
              value={`${certificate.school.name}${certificate.school.city ? `, ${certificate.school.city}` : ""}`}
            />
            {certificate.school.udiseCode ? (
              <Row label="UDISE code" value={certificate.school.udiseCode} mono />
            ) : null}
          </dl>
        ) : null}

        <p className="border-t border-line bg-paper-2/60 px-6 py-3 text-[11.5px] leading-snug text-ink-3">
          Only the details printed on the certificate are shown here. This page cannot be used to look
          up a school&rsquo;s students.
        </p>
      </div>

      <p className="mt-6 text-[12.5px] text-ink-3">
        Certificate verification by Flanca · flanca.online
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex gap-4 px-6 py-2.5">
      <dt className="w-40 shrink-0 text-[12.5px] text-ink-3">{label}</dt>
      <dd className={`text-[13.5px] ${mono ? "font-mono text-[12.5px]" : ""} ${bold ? "font-semibold" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
