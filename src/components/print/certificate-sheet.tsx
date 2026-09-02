import { certificateMeta } from "@/lib/core/certificate-core";
import { formatPercent } from "@/lib/core/grading-core";
import type { SchoolHeader } from "./receipt-sheet";

export type CertificateSnapshot = {
  studentName?: string;
  admissionNumber?: string;
  fatherName?: string | null;
  motherName?: string | null;
  dob?: string | null;
  dobInWords?: string | null;
  category?: string | null;
  religion?: string | null;
  nationality?: string;
  className?: string | null;
  sectionName?: string | null;
  admissionDate?: string | null;
  academicYear?: string | null;
  apaarId?: string | null;
  penNumber?: string | null;
  subjectsStudied?: string[];
  workingDays?: number;
  daysPresent?: number;
  attendancePercentBp?: number;
  concessions?: string[];
  yearsAttended?: Array<{ year: string; className: string | null }>;
  conduct?: string;
  leavingReason?: string | null;
  purpose?: string | null;
  remarks?: string | null;
  issuedByName?: string;
};

const DATE = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })
    : "—";

/**
 * School certificates, printed the way an Indian school issues them: ruled
 * fields, the child's date of birth in words (so a figure cannot be altered),
 * a serial that is never reused, and a verification code the receiving school
 * can check online.
 */
export function CertificateSheet({
  school,
  type,
  serialNo,
  issuedOn,
  snapshot,
  verifyUrl,
  cancelledAt,
}: {
  school: SchoolHeader;
  type: string;
  serialNo: string;
  issuedOn: Date;
  snapshot: CertificateSnapshot;
  verifyUrl: string;
  cancelledAt?: Date | null;
}) {
  const meta = certificateMeta(type);
  const s = snapshot;

  return (
    <article className="relative mx-auto max-w-[820px] bg-white p-9 text-ink print:max-w-none print:p-2">
      {cancelledAt ? (
        <p className="absolute inset-x-0 top-1/2 -rotate-12 text-center text-[64px] font-bold tracking-widest text-overdue/15">
          CANCELLED
        </p>
      ) : null}

      <header className="border-b-2 border-ink pb-3 text-center">
        <h1 className="font-display text-[24px] leading-tight font-bold tracking-tight">{school.name}</h1>
        {school.address ? <p className="mt-0.5 text-[11.5px]">{school.address}</p> : null}
        <p className="mt-0.5 text-[11px]">
          {[
            school.affiliationNo ? `Affiliation No: ${school.affiliationNo}` : null,
            school.udiseCode ? `UDISE Code: ${school.udiseCode}` : null,
            school.phone ? `Ph: ${school.phone}` : null,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      </header>

      <div className="mt-4 flex items-center justify-between text-[12px]">
        <p>
          <span className="text-ink-3">Serial No: </span>
          <strong>{serialNo}</strong>
        </p>
        <p>
          <span className="text-ink-3">Date of issue: </span>
          <strong>
            {issuedOn.toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </strong>
        </p>
      </div>

      <h2 className="mt-4 text-center font-display text-[19px] font-bold tracking-[0.14em] uppercase underline underline-offset-[6px]">
        {meta.label}
      </h2>

      {/* ── Transfer Certificate: the full statutory field list ── */}
      {type === "TRANSFER" ? (
        <ol className="mt-5 space-y-0 text-[12.5px]">
          <Field n={1} label="Name of the student" value={s.studentName ?? "—"} bold />
          <Field n={2} label="Father's / Guardian's name" value={s.fatherName ?? "—"} />
          <Field n={3} label="Mother's name" value={s.motherName ?? "—"} />
          <Field n={4} label="Nationality" value={s.nationality ?? "Indian"} />
          <Field n={5} label="Category" value={s.category ?? "—"} />
          <Field n={6} label="Date of birth (in figures)" value={DATE(s.dob)} />
          <Field n={7} label="Date of birth (in words)" value={s.dobInWords ?? "—"} bold />
          <Field n={8} label="Admission number" value={s.admissionNumber ?? "—"} />
          <Field n={9} label="Date of admission" value={DATE(s.admissionDate)} />
          <Field n={10} label="APAAR ID / PEN" value={[s.apaarId, s.penNumber].filter(Boolean).join(" / ") || "—"} />
          <Field n={11} label="Class in which studying" value={`${s.className ?? "—"}${s.sectionName ? ` ${s.sectionName}` : ""}`} />
          <Field n={12} label="Subjects studied" value={s.subjectsStudied?.length ? s.subjectsStudied.join(", ") : "As per the prescribed curriculum"} />
          <Field
            n={13}
            label="Total working days / days present"
            value={
              s.workingDays
                ? `${s.workingDays} / ${s.daysPresent}${s.attendancePercentBp != null ? ` (${formatPercent(s.attendancePercentBp, 1)})` : ""}`
                : "—"
            }
          />
          <Field n={14} label="Fee concession, if any" value={s.concessions?.length ? s.concessions.join(", ") : "None"} />
          <Field n={15} label="General conduct" value={s.conduct ?? "Good"} bold />
          <Field n={16} label="Reason for leaving the school" value={s.leavingReason ?? "—"} />
          <Field n={17} label="Any other remarks" value={s.remarks ?? "—"} />
        </ol>
      ) : (
        <div className="mt-6 space-y-4 text-[13.5px] leading-[1.9]">
          <p>
            This is to certify that <strong>{s.studentName ?? "—"}</strong>
            {s.fatherName ? (
              <>
                , son/daughter of <strong>{s.fatherName}</strong>
              </>
            ) : null}
            {s.dob ? (
              <>
                , born on <strong>{DATE(s.dob)}</strong>
                {s.dobInWords ? ` (${s.dobInWords})` : ""}
              </>
            ) : null}
            , bearing admission number <strong>{s.admissionNumber ?? "—"}</strong>,{" "}
            {bodyFor(type, s)}
          </p>

          {type === "CHARACTER" || type === "CONDUCT" ? (
            <p>
              During this period the general conduct and character of the student were found to be{" "}
              <strong>{s.conduct ?? "Good"}</strong>.
            </p>
          ) : null}

          {type === "STUDY" && s.yearsAttended?.length ? (
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className="border border-line-2 px-2 py-1.5 text-left font-semibold">Academic year</th>
                  <th className="border border-line-2 px-2 py-1.5 text-left font-semibold">Class</th>
                </tr>
              </thead>
              <tbody>
                {s.yearsAttended.map((y) => (
                  <tr key={y.year}>
                    <td className="border border-line-2 px-2 py-1.5">{y.year}</td>
                    <td className="border border-line-2 px-2 py-1.5">{y.className ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {s.purpose ? (
            <p>
              This certificate is issued for the purpose of <strong>{s.purpose}</strong>.
            </p>
          ) : null}

          {s.remarks ? <p>{s.remarks}</p> : null}
        </div>
      )}

      <footer className="mt-12 flex items-end justify-between">
        <div className="max-w-[300px]">
          <p className="text-[10.5px] leading-snug text-ink-3">
            Verify this certificate at
            <br />
            <span className="font-mono text-ink-2">{verifyUrl}</span>
          </p>
          <p className="mt-2 text-[10px] text-ink-3">
            Serial numbers are issued in an unbroken sequence and are never reused. A cancelled
            certificate remains on record.
          </p>
        </div>
        <div className="text-center">
          <div className="mb-1 h-10 w-48 border-b border-ink" />
          <p className="text-[11px] font-semibold">Principal</p>
          <p className="text-[10px] text-ink-3">{school.name}</p>
        </div>
      </footer>
    </article>
  );
}

function bodyFor(type: string, s: CertificateSnapshot): React.ReactNode {
  const cls = `${s.className ?? "—"}${s.sectionName ? ` ${s.sectionName}` : ""}`;

  switch (type) {
    case "BONAFIDE":
      return (
        <>
          is a bonafide student of this school and is studying in <strong>{cls}</strong> during the
          academic year <strong>{s.academicYear ?? "—"}</strong>.
        </>
      );
    case "CHARACTER":
      return (
        <>
          was a student of this school and studied up to <strong>{cls}</strong>.
        </>
      );
    case "CONDUCT":
      return (
        <>
          is studying in <strong>{cls}</strong> in the academic year{" "}
          <strong>{s.academicYear ?? "—"}</strong>.
        </>
      );
    case "STUDY":
      return <>studied in this school as detailed below.</>;
    case "FEE_PAID":
      return (
        <>
          is a student of <strong>{cls}</strong> and has paid all school fees due for the academic
          year <strong>{s.academicYear ?? "—"}</strong>.
        </>
      );
    default:
      return <>is a student of this school.</>;
  }
}

function Field({
  n,
  label,
  value,
  bold,
}: {
  n: number;
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <li className="flex gap-3 border-b border-dotted border-line-2 py-[5px]">
      <span className="w-6 shrink-0 text-ink-3">{n}.</span>
      <span className="w-[260px] shrink-0 text-ink-2">{label}</span>
      <span className={`min-w-0 flex-1 ${bold ? "font-semibold" : ""}`}>{value}</span>
    </li>
  );
}
