// aliased: the component already takes a `percentBp` PROP, which would shadow it
import { CBSE_8_POINT, formatPercent, gradeFor, percentBp as toPercentBp } from "@/lib/core/grading-core";
import type { SchoolHeader } from "./receipt-sheet";

export type CardSnapshot = {
  term?: string;
  className?: string;
  section?: string;
  subjects?: Array<{
    subject: string;
    maxMarks: number;
    marks: number | null;
    isAbsent?: boolean;
    grade?: string | null;
  }>;
  failedSubjects?: string[];
  result?: "PASS" | "FAIL" | "PENDING";
  pending?: string[];
  // Nursery/LKG/UKG: graded holistically, no marks at all.
  holistic?: boolean;
  skills?: Array<{ skillArea: string; rating: string | null }>;
};

const SKILL_RATING_LABEL: Record<string, string> = {
  BEGINNING: "Beginning",
  DEVELOPING: "Developing",
  PROFICIENT: "Proficient",
};

export type CardStudent = {
  name: string;
  admissionNumber: string;
  rollNumber: number | null;
  fatherName: string | null;
  motherName: string | null;
  dob: Date | null;
  apaarId: string | null;
};

/**
 * A CBSE-style progress report, built to come out of a school's own printer.
 * Black on white, ruled boxes, signature blocks — a parent files this, and the
 * school shows it to an inspector.
 */
export function ReportCardSheet({
  school,
  student,
  snapshot,
  totalMarks,
  maxMarks,
  percentBp,
  grade,
  rankInClass,
  attendancePercentBp,
  classTeacherRemark,
  principalRemark,
  publishedAt,
  academicYear,
  className,
  sectionName,
}: {
  school: SchoolHeader;
  student: CardStudent;
  snapshot: CardSnapshot;
  totalMarks: number | null;
  maxMarks: number | null;
  percentBp: number | null;
  grade: string | null;
  rankInClass: number | null;
  attendancePercentBp: number | null;
  classTeacherRemark: string | null;
  principalRemark?: string | null;
  publishedAt: Date | null;
  academicYear: string;
  className?: string | null;
  sectionName?: string | null;
}) {
  const subjects = snapshot.subjects ?? [];
  const result = snapshot.result ?? "PENDING";
  // An older snapshot may predate a field. Derive rather than print a dash:
  // a blank on a child's report card is never acceptable.
  const classLabel =
    [className ?? snapshot.className, sectionName ?? snapshot.section].filter(Boolean).join(" ") || "—";

  return (
    <article className="mx-auto max-w-[820px] bg-white p-8 text-ink print:max-w-none print:p-0">
      {/* ── header ── */}
      <header className="border-b-2 border-ink pb-3 text-center">
        <h1 className="font-display text-[23px] leading-tight font-bold tracking-tight">{school.name}</h1>
        {school.address ? <p className="mt-0.5 text-[11.5px]">{school.address}</p> : null}
        <p className="mt-0.5 text-[11px]">
          {[
            school.affiliationNo ? `Affiliation No: ${school.affiliationNo}` : null,
            school.udiseCode ? `UDISE: ${school.udiseCode}` : null,
            school.phone ? `Ph: ${school.phone}` : null,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      </header>

      <h2 className="mt-3 text-center font-display text-[15px] font-bold tracking-[0.12em] uppercase">
        Progress Report — {snapshot.term ?? "Term"} · {academicYear}
      </h2>

      {/* ── who ── */}
      <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 border border-line-2 p-3 text-[12.5px]">
        <Row label="Student" value={student.name} bold />
        <Row label="Admission No" value={student.admissionNumber} />
        <Row label="Class" value={classLabel} />
        <Row label="Roll No" value={student.rollNumber != null ? String(student.rollNumber) : "—"} />
        <Row label="Father" value={student.fatherName ?? "—"} />
        <Row label="Mother" value={student.motherName ?? "—"} />
        <Row
          label="Date of Birth"
          value={
            student.dob
              ? student.dob.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
              : "—"
          }
        />
        <Row label="APAAR ID" value={student.apaarId ?? "—"} />
      </dl>

      {snapshot.holistic ? (
        <>
          {/* ── skill ratings — no marks, no rank, no pass/fail ── */}
          <table className="mt-3 w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className="w-10 border border-line-2 px-2 py-1.5 text-left font-semibold">#</th>
                <th className="border border-line-2 px-2 py-1.5 text-left font-semibold">Skill Area</th>
                <th className="w-40 border border-line-2 px-2 py-1.5 text-center font-semibold">Rating</th>
              </tr>
            </thead>
            <tbody>
              {(snapshot.skills ?? []).length === 0 ? (
                <tr>
                  <td colSpan={3} className="border border-line-2 px-2 py-3 text-center text-ink-3">
                    No skill areas recorded for this term.
                  </td>
                </tr>
              ) : (
                (snapshot.skills ?? []).map((s, i) => (
                  <tr key={`${s.skillArea}-${i}`}>
                    <td className="border border-line-2 px-2 py-1.5 tnum">{i + 1}</td>
                    <td className="border border-line-2 px-2 py-1.5">{s.skillArea}</td>
                    <td className="border border-line-2 px-2 py-1.5 text-center font-semibold">
                      {s.rating ? (SKILL_RATING_LABEL[s.rating] ?? s.rating) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="mt-3 grid grid-cols-1 gap-2">
            <Box
              label="Attendance"
              value={attendancePercentBp != null ? formatPercent(attendancePercentBp, 1) : "—"}
            />
          </div>
        </>
      ) : (
        <>
          {/* ── marks ── */}
          <table className="mt-3 w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className="w-10 border border-line-2 px-2 py-1.5 text-left font-semibold">#</th>
                <th className="border border-line-2 px-2 py-1.5 text-left font-semibold">Subject</th>
                <th className="w-24 border border-line-2 px-2 py-1.5 text-right font-semibold">Max Marks</th>
                <th className="w-24 border border-line-2 px-2 py-1.5 text-right font-semibold">Marks Obtained</th>
                <th className="w-20 border border-line-2 px-2 py-1.5 text-center font-semibold">Grade</th>
              </tr>
            </thead>
            <tbody>
              {subjects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border border-line-2 px-2 py-3 text-center text-ink-3">
                    No subjects recorded for this term.
                  </td>
                </tr>
              ) : (
                subjects.map((s, i) => (
                  <tr key={`${s.subject}-${i}`}>
                    <td className="border border-line-2 px-2 py-1.5 tnum">{i + 1}</td>
                    <td className="border border-line-2 px-2 py-1.5">{s.subject}</td>
                    <td className="border border-line-2 px-2 py-1.5 text-right tnum">{s.maxMarks}</td>
                    <td className="border border-line-2 px-2 py-1.5 text-right tnum">
                      {s.isAbsent ? "AB" : s.marks == null ? "—" : s.marks}
                    </td>
                    <td className="border border-line-2 px-2 py-1.5 text-center">
                      {s.isAbsent
                        ? "—"
                        : (s.grade ??
                          (s.marks == null
                            ? "—"
                            : (gradeFor(toPercentBp(s.marks, s.maxMarks), CBSE_8_POINT)?.grade ?? "—")))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="border border-line-2 px-2 py-2 text-right font-bold">
                  Total
                </td>
                <td className="border border-line-2 px-2 py-2 text-right font-bold tnum">{maxMarks ?? "—"}</td>
                <td className="border border-line-2 px-2 py-2 text-right font-bold tnum">{totalMarks ?? "—"}</td>
                <td className="border border-line-2 px-2 py-2 text-center font-bold">{grade ?? "—"}</td>
              </tr>
            </tfoot>
          </table>

          {/* ── summary ── */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Box label="Percentage" value={percentBp != null ? formatPercent(percentBp, 2) : "—"} />
            <Box label="Grade" value={grade ?? "—"} />
            <Box label="Rank in class" value={rankInClass != null ? String(rankInClass) : "—"} />
            <Box
              label="Attendance"
              value={attendancePercentBp != null ? formatPercent(attendancePercentBp, 1) : "—"}
            />
          </div>

          <div className="mt-3 border border-line-2 px-3 py-2 text-[12.5px]">
            <span className="font-semibold">Result: </span>
            {result === "PASS" ? (
              <span className="font-bold">PASSED</span>
            ) : result === "FAIL" ? (
              <span className="font-bold">
                NEEDS IMPROVEMENT
                {snapshot.failedSubjects && snapshot.failedSubjects.length > 0
                  ? ` — below pass mark in ${snapshot.failedSubjects.join(", ")}`
                  : ""}
              </span>
            ) : (
              <span className="font-bold">
                PENDING
                {snapshot.pending && snapshot.pending.length > 0
                  ? ` — marks not yet entered for ${snapshot.pending.join(", ")}`
                  : ""}
              </span>
            )}
          </div>
        </>
      )}

      {/* ── remark ── */}
      <div className="mt-3 border border-line-2 px-3 py-2">
        <p className="text-[11px] font-semibold tracking-wide uppercase">Class teacher's remark</p>
        <p className="mt-1 min-h-[36px] text-[12.5px]">
          {classTeacherRemark ?? <span className="text-ink-3">—</span>}
        </p>
      </div>

      <div className="mt-3 border border-line-2 px-3 py-2">
        <p className="text-[11px] font-semibold tracking-wide uppercase">Principal's remark</p>
        <p className="mt-1 min-h-[36px] text-[12.5px]">
          {principalRemark ?? <span className="text-ink-3">—</span>}
        </p>
      </div>

      {/* ── signatures ── */}
      <footer className="mt-10 flex items-end justify-between">
        <div className="text-center">
          <div className="mb-1 h-8 w-36 border-b border-ink" />
          <p className="text-[10.5px]">Class Teacher</p>
        </div>
        <div className="text-center">
          <div className="mb-1 h-8 w-36 border-b border-ink" />
          <p className="text-[10.5px]">Parent / Guardian</p>
        </div>
        <div className="text-center">
          <div className="mb-1 h-8 w-36 border-b border-ink" />
          <p className="text-[10.5px]">Principal</p>
        </div>
      </footer>

      <p className="mt-4 text-center text-[10px] text-ink-3">
        {publishedAt
          ? `Result declared on ${publishedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`
          : "Provisional — this result has not been declared yet."}{" "}
        Computer-generated report card.
      </p>
    </article>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-ink-3">{label}</dt>
      <dd className={bold ? "font-semibold" : ""}>{value}</dd>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line-2 px-2 py-1.5 text-center">
      <p className="text-[10px] font-semibold tracking-wide uppercase text-ink-3">{label}</p>
      <p className="mt-0.5 text-[15px] font-bold tnum">{value}</p>
    </div>
  );
}
