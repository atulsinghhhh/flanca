import { buildUdiseStudentExport } from "@/lib/queries/compliance";
import { db } from "@/lib/db";
import { audit, requireRole, OFFICE } from "@/lib/session";

/** UDISE+ student export as CSV, with blockers named in a trailing section. */
export async function GET() {
  const actor = await requireRole(...OFFICE);
  const { rows, blockers } = await buildUdiseStudentExport(actor.schoolId);

  const headers = [
    "Admission No", "Student Name", "Name as per Aadhaar", "APAAR ID", "PEN",
    "Class", "Section", "Roll No", "Gender", "Date of Birth", "Category",
    "Religion", "Mother Tongue", "Father Name", "Mother Name", "Mobile",
    "Address", "Admission Date",
  ];

  const lines = [headers.map(csv).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.admissionNumber, r.name, r.aadhaarName, r.apaarId, r.penNumber,
        r.className, r.sectionName, r.rollNumber, r.gender, r.dob, r.category,
        r.religion, r.motherTongue, r.fatherName, r.motherName, r.guardianPhone,
        r.address, r.admissionDate,
      ].map(csv).join(","),
    );
  }

  // Blockers are listed IN the file rather than dropped, so nobody uploads a
  // partial roll believing it is complete.
  if (blockers.length > 0) {
    lines.push("");
    lines.push(csv(`${blockers.length} students below have no APAAR ID and will block certification`));
    lines.push(["Admission No", "Student Name", "Reason"].map(csv).join(","));
    for (const b of blockers) {
      lines.push([b.admissionNumber, b.name, b.reason].map(csv).join(","));
    }
  }

  const year = await db.academicYear.findFirst({
    where: { schoolId: actor.schoolId, isCurrent: true },
    select: { name: true },
  });

  await db.udiseExport.create({
    data: {
      schoolId: actor.schoolId,
      kind: "STUDENT",
      academicYear: year?.name ?? "",
      rowCount: rows.length,
      blockers: blockers as never,
      generatedBy: actor.id,
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "udise.export",
    entity: "School",
    entityId: actor.schoolId,
    summary: `Exported ${rows.length} students for UDISE+${blockers.length ? `, ${blockers.length} blocked by a missing APAAR ID` : ""}`,
  });

  return new Response(`﻿${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="udise-students-${year?.name ?? "export"}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csv(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
