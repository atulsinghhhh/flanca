import { db } from "@/lib/db";
import {
  apaarCoverage, daysToFreeze, deriveApaarState, nameMismatch, nextAction,
  type ApaarState,
} from "@/lib/core/apaar-core";

export type ApaarRow = {
  id: string;
  name: string;
  admissionNumber: string;
  className: string;
  sequenceOrder: number;
  sectionName: string;
  guardianPhone: string | null;
  apaarId: string | null;
  penNumber: string | null;
  aadhaarName: string | null;
  apaarNote: string | null;
  state: ApaarState;
  nextAction: string;
  nameCheck: ReturnType<typeof nameMismatch>;
  consentGranted: boolean;
  consentRefused: boolean;
};

/**
 * The APAAR command centre.
 *
 * APAAR is mandatory for every student Class 1–12 in 2026-27 and UDISE+
 * certification FREEZES on 30 September 2026 — a student without an ID blocks
 * the school's whole certification. No competitor tracks this workflow at all,
 * so it is the reason a principal picks up the phone in September.
 */
export async function getApaarCentre(
  schoolId: string,
  filters: { state?: ApaarState; classId?: string; q?: string } = {},
  asOf = new Date(),
) {
  const students = await db.student.findMany({
    where: {
      schoolId,
      status: "ACTIVE",
      ...(filters.classId ? { classId: filters.classId } : {}),
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" } },
              { admissionNumber: { contains: filters.q, mode: "insensitive" } },
              { apaarId: { contains: filters.q } },
            ],
          }
        : {}),
    },
    orderBy: [{ class: { sequenceOrder: "asc" } }, { section: { name: "asc" } }, { rollNumber: "asc" }],
    select: {
      id: true, name: true, admissionNumber: true, guardianPhone: true,
      apaarId: true, penNumber: true, aadhaarName: true, apaarStatus: true, apaarNote: true,
      class: { select: { id: true, name: true, sequenceOrder: true } },
      section: { select: { name: true } },
      consentRecords: { where: { purpose: "APAAR_GENERATION" }, select: { state: true } },
    },
  });

  const rows: ApaarRow[] = students.map((s) => {
    const consentGranted = s.consentRecords.some((c) => c.state === "GRANTED");
    const consentRefused = s.consentRecords.some((c) => c.state === "REFUSED");
    const state = deriveApaarState({
      id: s.id,
      name: s.name,
      apaarId: s.apaarId,
      apaarStatus: s.apaarStatus,
      aadhaarName: s.aadhaarName,
      consentGranted,
      consentRefused,
    });

    return {
      id: s.id,
      name: s.name,
      admissionNumber: s.admissionNumber,
      className: s.class?.name ?? "—",
      sequenceOrder: s.class?.sequenceOrder ?? 99,
      sectionName: s.section?.name ?? "",
      guardianPhone: s.guardianPhone,
      apaarId: s.apaarId,
      penNumber: s.penNumber,
      aadhaarName: s.aadhaarName,
      apaarNote: s.apaarNote,
      state,
      nextAction: nextAction(state),
      nameCheck: nameMismatch(s.name, s.aadhaarName),
      consentGranted,
      consentRefused,
    };
  });

  const coverage = apaarCoverage(
    students.map((s) => ({
      id: s.id,
      name: s.name,
      apaarId: s.apaarId,
      apaarStatus: s.apaarStatus,
      aadhaarName: s.aadhaarName,
      consentGranted: s.consentRecords.some((c) => c.state === "GRANTED"),
      consentRefused: s.consentRecords.some((c) => c.state === "REFUSED"),
    })),
  );

  // Class-wise, because certification is chased class teacher by class teacher.
  const byClass = new Map<string, { className: string; sequenceOrder: number; total: number; issued: number }>();
  for (const r of rows) {
    const acc = byClass.get(r.className) ?? {
      className: r.className, sequenceOrder: r.sequenceOrder, total: 0, issued: 0,
    };
    acc.total += 1;
    if (r.state === "ISSUED") acc.issued += 1;
    byClass.set(r.className, acc);
  }

  const filtered = filters.state ? rows.filter((r) => r.state === filters.state) : rows;

  return {
    rows: filtered,
    blocking: rows.filter((r) => r.state !== "ISSUED"),
    mismatches: rows.filter((r) => r.state !== "ISSUED" && !r.nameCheck.matches),
    coverage,
    daysToFreeze: daysToFreeze(asOf),
    classSummary: [...byClass.values()]
      .map((c) => ({ ...c, coverageBp: c.total > 0 ? Math.round((c.issued / c.total) * 10000) : 0 }))
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder),
  };
}

export const CONSENT_PURPOSES = [
  { value: "ENROLMENT_DATA", label: "Enrolment data", note: "Name, date of birth, address, parent details" },
  { value: "APAAR_GENERATION", label: "APAAR generation", note: "Sharing Aadhaar details with UDISE+ to create the ID" },
  { value: "PHOTO_MEDIA", label: "Photos & video", note: "School events, website, prospectus — explicitly covered by the Act" },
  { value: "COMMUNICATION", label: "Communication", note: "SMS, WhatsApp and email to the parent" },
  { value: "HEALTH_RECORDS", label: "Health records", note: "Medical conditions, allergies, emergency care" },
  { value: "THIRD_PARTY_SHARING", label: "Third-party sharing", note: "Board, transport vendor, insurer" },
] as const;

/**
 * DPDP consent register.
 *
 * The Act requires VERIFIABLE parental consent before processing a child's
 * data — a tick-box on an admission form does not qualify. Consent Manager
 * rules commence 13 Nov 2026, broader obligations by May 2027, and the penalty
 * for children's data runs to Rs 200 crore. No competitor has built this.
 */
export async function getConsentRegister(
  schoolId: string,
  filters: { purpose?: string; state?: string; classId?: string; q?: string } = {},
) {
  const [records, students] = await Promise.all([
    db.consentRecord.groupBy({
      by: ["purpose", "state"],
      where: { schoolId },
      _count: true,
    }),
    db.student.findMany({
      where: {
        schoolId,
        status: "ACTIVE",
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.q
          ? {
              OR: [
                { name: { contains: filters.q, mode: "insensitive" } },
                { admissionNumber: { contains: filters.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ class: { sequenceOrder: "asc" } }, { section: { name: "asc" } }, { rollNumber: "asc" }],
      select: {
        id: true, name: true, admissionNumber: true, guardianPhone: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
        consentRecords: true,
      },
    }),
  ]);

  const byPurpose = new Map<string, Record<string, number>>();
  for (const r of records) {
    const acc = byPurpose.get(r.purpose) ?? {};
    acc[r.state] = r._count;
    byPurpose.set(r.purpose, acc);
  }

  const purposes = CONSENT_PURPOSES.map((p) => {
    const counts = byPurpose.get(p.value) ?? {};
    const granted = counts.GRANTED ?? 0;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      ...p,
      granted,
      pending: counts.PENDING ?? 0,
      refused: counts.REFUSED ?? 0,
      withdrawn: counts.WITHDRAWN ?? 0,
      total,
      // A purpose nobody has been asked about is 0% covered, not 100%.
      coverageBp: students.length > 0 ? Math.round((granted / students.length) * 10000) : 0,
    };
  });

  const rows = students
    .map((s) => {
      const byKey = new Map(s.consentRecords.map((c) => [c.purpose, c]));
      const relevant = filters.purpose ? [filters.purpose] : CONSENT_PURPOSES.map((p) => p.value);
      const missing = relevant.filter((p) => byKey.get(p as never)?.state !== "GRANTED");

      return {
        id: s.id,
        name: s.name,
        admissionNumber: s.admissionNumber,
        className: `${s.class?.name ?? "—"}${s.section ? ` ${s.section.name}` : ""}`,
        phone: s.guardianPhone,
        records: CONSENT_PURPOSES.map((p) => ({
          purpose: p.value,
          label: p.label,
          state: byKey.get(p.value as never)?.state ?? "PENDING",
          verifiedVia: byKey.get(p.value as never)?.verifiedVia ?? null,
          grantedAt: byKey.get(p.value as never)?.grantedAt ?? null,
        })),
        missingCount: missing.length,
      };
    })
    .filter((r) => (filters.state === "PENDING" ? r.missingCount > 0 : true));

  const fullyCovered = rows.filter((r) => r.missingCount === 0).length;

  return {
    purposes,
    rows,
    studentCount: students.length,
    fullyCovered,
    fullyCoveredBp: students.length > 0 ? Math.round((fullyCovered / students.length) * 10000) : 0,
  };
}

/** UDISE+ student export rows, with the blockers named rather than silently dropped. */
export async function buildUdiseStudentExport(schoolId: string) {
  const students = await db.student.findMany({
    where: { schoolId, status: "ACTIVE" },
    orderBy: [{ class: { sequenceOrder: "asc" } }, { rollNumber: "asc" }],
    include: { class: true, section: true },
  });

  const rows = students.map((s) => ({
    admissionNumber: s.admissionNumber,
    name: s.name,
    aadhaarName: s.aadhaarName ?? "",
    apaarId: s.apaarId ?? "",
    penNumber: s.penNumber ?? "",
    className: s.class?.name ?? "",
    sectionName: s.section?.name ?? "",
    rollNumber: s.rollNumber ?? "",
    gender: s.gender ?? "",
    dob: s.dob ? s.dob.toISOString().slice(0, 10) : "",
    category: s.category ?? "",
    religion: s.religion ?? "",
    motherTongue: s.motherTongue ?? "",
    fatherName: s.fatherName ?? "",
    motherName: s.motherName ?? "",
    guardianPhone: s.guardianPhone ?? "",
    address: s.address ?? "",
    admissionDate: s.admissionDate ? s.admissionDate.toISOString().slice(0, 10) : "",
  }));

  const blockers = students
    .filter((s) => !s.apaarId)
    .map((s) => ({
      studentId: s.id,
      admissionNumber: s.admissionNumber,
      name: s.name,
      reason: "No APAAR ID — this student blocks certification",
    }));

  return { rows, blockers };
}
