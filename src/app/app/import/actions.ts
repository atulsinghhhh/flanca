"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit, requireActor, requireRole, MONEY, OFFICE } from "@/lib/session";
import { parseWorkbook } from "@/lib/import/parse";
import {
  FEE_STRUCTURE_FIELDS, mapColumns, normaliseHeader, removableAfterUndo,
  STAFF_FIELDS, STUDENT_FIELDS, summariseBatch, validateFeeStructureRow, validateRow, validateStaffRow,
  type RowMessage,
} from "@/lib/core/import-core";
import { classOrderFor, tidyClassName } from "@/lib/core/setup-core";
import { createStaff, type StaffInput } from "../staff/people-actions";
import { setClassFees } from "../fees/structures/actions";

const MAX_ROWS = 5000;

/**
 * Step 1 — upload and VALIDATE. Nothing is written to the school's records here.
 * The principal sees every row and its problems before approving anything.
 */
export async function uploadStudentFile(_prev: unknown, formData: FormData) {
  const actor = await requireRole(...OFFICE);
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file first." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "That file is larger than 10 MB. Split it and import in two passes." };
  }

  let parsed;
  try {
    parsed = parseWorkbook(await file.arrayBuffer());
  } catch {
    return { error: "We could not read that file. Save it as .xlsx or .csv and try again." };
  }

  if (parsed.rows.length === 0) {
    return { error: "That file has no data rows we can read." };
  }
  if (parsed.rows.length > MAX_ROWS) {
    return { error: `That file has ${parsed.rows.length} rows. Import at most ${MAX_ROWS} at a time.` };
  }

  const columnMap = mapColumns(parsed.headers, STUDENT_FIELDS);

  const seen = new Set<string>();
  const validated = parsed.rows.map((raw, i) =>
    validateRow({
      rowNumber: i + 2, // +2: 1-indexed, and the header occupies the first row
      raw,
      columnMap,
      specs: STUDENT_FIELDS,
      seenAdmissionNumbers: seen,
    }),
  );

  // Admission numbers already on the roll are updates, not errors — but the
  // principal must be told, because a silent overwrite is exactly what schools fear.
  const incoming = validated
    .map((r) => r.parsed.admissionNumber as string | undefined)
    .filter((v): v is string => Boolean(v));

  const existing = incoming.length
    ? await db.student.findMany({
        where: { schoolId: actor.schoolId, admissionNumber: { in: incoming } },
        select: { admissionNumber: true },
      })
    : [];
  const existingSet = new Set(existing.map((e) => e.admissionNumber));

  for (const row of validated) {
    const adm = row.parsed.admissionNumber as string | undefined;
    if (adm && existingSet.has(adm)) {
      row.messages.push({
        field: "admissionNumber",
        level: "WARNING",
        message: `${adm} is already on the roll — this row will UPDATE that student`,
      });
      if (row.state === "OK") row.state = "WARNING";
    }
  }

  const summary = summariseBatch(validated);

  const batch = await db.importBatch.create({
    data: {
      schoolId: actor.schoolId,
      kind: "STUDENTS",
      status: "VALIDATED",
      fileName: file.name,
      totalRows: summary.totalRows,
      okRows: summary.okRows,
      warningRows: summary.warningRows,
      errorRows: summary.errorRows,
      columnMap: columnMap as never,
      uploadedBy: actor.id,
      note: parsed.sheetName ? `Sheet "${parsed.sheetName}"` : null,
      rows: {
        create: validated.map((r) => ({
          rowNumber: r.rowNumber,
          raw: r.raw as never,
          parsed: r.parsed as never,
          state: r.state,
          messages: r.messages as never,
        })),
      },
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "import.validate",
    entity: "ImportBatch",
    entityId: batch.id,
    summary: `Validated ${summary.totalRows} rows from ${file.name} (${summary.errorRows} errors)`,
  });

  redirect(`/app/import/${batch.id}`);
}

/** Step 1 — upload and VALIDATE a staff sheet. Same promise: nothing is written yet. */
export async function uploadStaffFile(_prev: unknown, formData: FormData) {
  const actor = await requireRole(...OFFICE);
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file first." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "That file is larger than 10 MB. Split it and import in two passes." };
  }

  let parsed;
  try {
    parsed = parseWorkbook(await file.arrayBuffer());
  } catch {
    return { error: "We could not read that file. Save it as .xlsx or .csv and try again." };
  }
  if (parsed.rows.length === 0) return { error: "That file has no data rows we can read." };
  if (parsed.rows.length > MAX_ROWS) {
    return { error: `That file has ${parsed.rows.length} rows. Import at most ${MAX_ROWS} at a time.` };
  }

  const columnMap = mapColumns(parsed.headers, STAFF_FIELDS);

  const seen = new Set<string>();
  const validated = parsed.rows.map((raw, i) =>
    validateStaffRow({ rowNumber: i + 2, raw, columnMap, seenEmails: seen }),
  );

  // An email already signed in somewhere is very often a person joining a
  // second school, not a mistake — createStaff itself decides that at apply
  // time, but the principal should see it coming rather than be surprised.
  const incoming = validated
    .map((r) => r.parsed.email as string | undefined)
    .filter((v): v is string => Boolean(v));
  const existingUsers = incoming.length
    ? await db.user.findMany({
        where: { email: { in: incoming } },
        select: { email: true, staffProfile: { select: { schoolId: true } } },
      })
    : [];
  const existingByEmail = new Map(existingUsers.map((u) => [u.email, u]));

  for (const row of validated) {
    const email = row.parsed.email as string | undefined;
    const existing = email ? existingByEmail.get(email) : undefined;
    if (!existing) continue;
    if (existing.staffProfile?.schoolId === actor.schoolId) {
      row.messages.push({ field: "email", level: "ERROR", message: `${email} is already on the staff here` });
      row.state = "ERROR";
    } else {
      row.messages.push({
        field: "email",
        level: "WARNING",
        message: `${email} already has a Flanca login elsewhere — their password will not change, they will just be added here`,
      });
      if (row.state === "OK") row.state = "WARNING";
    }
  }

  const summary = summariseBatch(validated);

  const batch = await db.importBatch.create({
    data: {
      schoolId: actor.schoolId,
      kind: "STAFF",
      status: "VALIDATED",
      fileName: file.name,
      totalRows: summary.totalRows,
      okRows: summary.okRows,
      warningRows: summary.warningRows,
      errorRows: summary.errorRows,
      columnMap: columnMap as never,
      uploadedBy: actor.id,
      note: parsed.sheetName ? `Sheet "${parsed.sheetName}"` : null,
      rows: {
        create: validated.map((r) => ({
          rowNumber: r.rowNumber,
          raw: r.raw as never,
          parsed: r.parsed as never,
          state: r.state,
          messages: r.messages as never,
        })),
      },
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "import.validate",
    entity: "ImportBatch",
    entityId: batch.id,
    summary: `Validated ${summary.totalRows} staff rows from ${file.name} (${summary.errorRows} errors)`,
  });

  redirect(`/app/import/${batch.id}`);
}

/** Step 1 — upload and VALIDATE a fee-structure sheet: one row per class + fee head. */
export async function uploadFeeStructureFile(_prev: unknown, formData: FormData) {
  const actor = await requireRole(...MONEY);
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file first." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "That file is larger than 10 MB. Split it and import in two passes." };
  }

  let parsed;
  try {
    parsed = parseWorkbook(await file.arrayBuffer());
  } catch {
    return { error: "We could not read that file. Save it as .xlsx or .csv and try again." };
  }
  if (parsed.rows.length === 0) return { error: "That file has no data rows we can read." };
  if (parsed.rows.length > MAX_ROWS) {
    return { error: `That file has ${parsed.rows.length} rows. Import at most ${MAX_ROWS} at a time.` };
  }

  const columnMap = mapColumns(parsed.headers, FEE_STRUCTURE_FIELDS);

  const [classes, heads] = await Promise.all([
    db.class.findMany({ where: { schoolId: actor.schoolId }, select: { id: true, name: true } }),
    db.feeHead.findMany({ where: { schoolId: actor.schoolId }, select: { id: true, name: true } }),
  ]);
  const classByName = new Map(classes.map((c) => [normaliseHeader(c.name), c]));
  const feeHeadByName = new Map(heads.map((h) => [normaliseHeader(h.name), h]));

  const validated = parsed.rows.map((raw, i) =>
    validateFeeStructureRow({ rowNumber: i + 2, raw, columnMap, classByName, feeHeadByName }),
  );

  const summary = summariseBatch(validated);

  const batch = await db.importBatch.create({
    data: {
      schoolId: actor.schoolId,
      kind: "FEE_STRUCTURE",
      status: "VALIDATED",
      fileName: file.name,
      totalRows: summary.totalRows,
      okRows: summary.okRows,
      warningRows: summary.warningRows,
      errorRows: summary.errorRows,
      columnMap: columnMap as never,
      uploadedBy: actor.id,
      note: parsed.sheetName ? `Sheet "${parsed.sheetName}"` : null,
      rows: {
        create: validated.map((r) => ({
          rowNumber: r.rowNumber,
          raw: r.raw as never,
          parsed: r.parsed as never,
          state: r.state,
          messages: r.messages as never,
        })),
      },
    },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "import.validate",
    entity: "ImportBatch",
    entityId: batch.id,
    summary: `Validated ${summary.totalRows} fee-structure rows from ${file.name} (${summary.errorRows} errors)`,
  });

  redirect(`/app/import/${batch.id}`);
}

/**
 * Step 2 — APPLY. Every kind of import is checked and shown before anything is
 * written, so this just routes to the writer for the kind this batch is —
 * each keeps its own role check, since a fee structure needs MONEY and a
 * roster or a staff list needs only OFFICE.
 */
export async function applyImport(batchId: string) {
  const actor = await requireActor();
  const batch = await db.importBatch.findFirst({
    where: { id: batchId, schoolId: actor.schoolId },
    select: { kind: true },
  });
  if (!batch) return { error: "That import no longer exists." };

  if (batch.kind === "STAFF") return applyStaffImport(batchId);
  if (batch.kind === "FEE_STRUCTURE") return applyFeeStructureImport(batchId);
  return applyStudentImport(batchId);
}

/** Runs in one transaction so a failure halfway cannot leave the roster half-imported. */
async function applyStudentImport(batchId: string) {
  const actor = await requireRole(...OFFICE);

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, schoolId: actor.schoolId },
    include: { rows: { where: { state: { in: ["OK", "WARNING"] } }, orderBy: { rowNumber: "asc" } } },
  });
  if (!batch) return { error: "That import no longer exists." };
  if (batch.status === "APPLIED") return { error: "This import has already been applied." };
  if (batch.status === "REVERTED") return { error: "This import was undone. Upload the file again." };

  const classes = await db.class.findMany({
    where: { schoolId: actor.schoolId },
    include: { sections: true },
  });
  const classByName = new Map(classes.map((c) => [normalise(c.name), c]));

  let created = 0;
  let updated = 0;
  // Recorded so undo can put the school back exactly as it was — see the
  // ImportBatch comment in schema.prisma.
  const createdClassIds: string[] = [];
  const createdSectionIds: string[] = [];

  await db.$transaction(async (tx) => {
    for (const row of batch.rows) {
      const p = row.parsed as Record<string, unknown>;
      const admissionNumber = String(p.admissionNumber ?? "").trim();
      if (!admissionNumber) continue;

      // Resolve (or create) the class and section named in the file. A school
      // importing into a fresh tenant should not have to set up classes first.
      let classId: string | null = null;
      let sectionId: string | null = null;

      const className = p.className ? String(p.className).trim() : "";
      if (className) {
        /*
         * Key the cache on the TIDIED name, not the raw cell.
         *
         * Keying on the raw value meant "V", "5" and "Class 5" in one file were
         * three cache misses that each tried to create a class named "Class 5",
         * and Class has a unique index on (schoolId, name) — so the second one
         * threw and took the whole transaction with it. A mixed-notation file is
         * exactly what a school that has changed office staff sends us.
         */
        const tidied = tidyClassName(className);
        const key = normalise(tidied);
        let cls = classByName.get(key);
        if (!cls) {
          const fresh = await tx.class.create({
            data: {
              schoolId: actor.schoolId,
              name: tidied,
              sequenceOrder: classOrderFor(tidied),
            },
            include: { sections: true },
          });
          cls = fresh;
          classByName.set(key, fresh);
          createdClassIds.push(fresh.id);
        }
        classId = cls.id;

        const sectionName = p.sectionName ? String(p.sectionName).trim().toUpperCase() : "";
        if (sectionName) {
          let section = cls.sections.find((s) => s.name.toUpperCase() === sectionName);
          if (!section) {
            section = await tx.section.create({
              data: { schoolId: actor.schoolId, classId: cls.id, name: sectionName },
            });
            cls.sections.push(section);
            createdSectionIds.push(section.id);
          }
          sectionId = section.id;
        }
      }

      const data = {
        name: String(p.name ?? "").trim(),
        classId,
        sectionId,
        rollNumber: typeof p.rollNumber === "number" ? p.rollNumber : null,
        gender: (p.gender as "MALE" | "FEMALE" | "OTHER" | undefined) ?? null,
        dob: asDate(p.dob),
        fatherName: str(p.fatherName),
        motherName: str(p.motherName),
        guardianPhone: str(p.guardianPhone),
        guardianEmail: str(p.guardianEmail),
        address: str(p.address),
        category: str(p.category),
        bloodGroup: str(p.bloodGroup),
        apaarId: str(p.apaarId),
        penNumber: str(p.penNumber),
        aadhaarName: str(p.aadhaarName) ?? String(p.name ?? "").trim(),
        admissionDate: asDate(p.admissionDate),
        apaarStatus: str(p.apaarId) ? "ISSUED" : "CONSENT_PENDING",
      };

      const existing = await tx.student.findUnique({
        where: { schoolId_admissionNumber: { schoolId: actor.schoolId, admissionNumber } },
        select: { id: true },
      });

      if (existing) {
        await tx.student.update({ where: { id: existing.id }, data });
        // The row's state stays its VALIDATION verdict forever, so the warning
        // history survives. "Was it written?" is answered by createdId.
        await tx.importRow.update({
          where: { id: row.id },
          data: { createdEntity: "Student", createdId: existing.id },
        });
        updated++;
      } else {
        const student = await tx.student.create({
          data: { schoolId: actor.schoolId, admissionNumber, status: "ACTIVE", ...data },
        });
        await tx.importRow.update({
          where: { id: row.id },
          data: { createdEntity: "Student", createdId: student.id },
        });
        created++;
      }
    }

    await tx.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "APPLIED",
        appliedRows: created + updated,
        appliedAt: new Date(),
        createdClassIds,
        createdSectionIds,
      },
    });
  }, { timeout: 120_000 });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "import.apply",
    entity: "ImportBatch",
    entityId: batch.id,
    summary: `Imported ${created} new students, updated ${updated}, from ${batch.fileName}`,
    reversible: true,
    after: { created, updated },
  });

  revalidatePath("/app/import");
  revalidatePath("/app/students");
  return { ok: true, created, updated };
}

/**
 * Writes each approved row through createStaff — the exact function the "Add
 * staff" form calls — so an imported member of staff gets the same User,
 * SchoolRole and Staff rows, the same first password, and the same audit line
 * as one added by hand. Not wrapped in one transaction: createStaff commits
 * its own, and one bad row (a race on an employee id, say) should not undo
 * the ninety people who imported cleanly.
 */
async function applyStaffImport(batchId: string) {
  const actor = await requireRole(...OFFICE);

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, schoolId: actor.schoolId, kind: "STAFF" },
    include: { rows: { where: { state: { in: ["OK", "WARNING"] } }, orderBy: { rowNumber: "asc" } } },
  });
  if (!batch) return { error: "That import no longer exists." };
  if (batch.status === "APPLIED") return { error: "This import has already been applied." };
  if (batch.status === "REVERTED") return { error: "This import was undone. Upload the file again." };

  let created = 0;
  const issued: { name: string; employeeId: string; firstPassword: string | null; reusedLogin: boolean }[] = [];
  const failures: { rowNumber: number; message: string }[] = [];

  for (const row of batch.rows) {
    const p = row.parsed as Record<string, unknown>;
    const input: StaffInput = {
      name: String(p.name ?? ""),
      email: String(p.email ?? ""),
      phone: typeof p.phone === "string" ? p.phone : null,
      employeeId: typeof p.employeeId === "string" ? p.employeeId : null,
      designation: typeof p.designation === "string" ? p.designation : null,
      department: typeof p.department === "string" ? p.department : null,
      qualification: typeof p.qualification === "string" ? p.qualification : null,
      roles: Array.isArray(p.roles) ? (p.roles as string[]) : [],
      basicPayText: typeof p.basicPay === "number" ? String(p.basicPay / 100) : null,
      joiningIso: asDate(p.joiningDate)?.toISOString().slice(0, 10) ?? null,
      dobIso: asDate(p.dob)?.toISOString().slice(0, 10) ?? null,
      gender: typeof p.gender === "string" ? p.gender : null,
      address: typeof p.address === "string" ? p.address : null,
      panNumber: typeof p.panNumber === "string" ? p.panNumber : null,
      bankAccountNo: typeof p.bankAccountNo === "string" ? p.bankAccountNo : null,
      bankIfsc: typeof p.bankIfsc === "string" ? p.bankIfsc : null,
    };

    const result = await createStaff(input);
    if (result.error) {
      failures.push({ rowNumber: row.rowNumber, message: result.error });
      const existingMessages = (row.messages ?? []) as RowMessage[];
      const messages = [...existingMessages, { field: "email", level: "ERROR" as const, message: `Not imported: ${result.error}` }];
      await db.importRow.update({ where: { id: row.id }, data: { messages: messages as never } });
      continue;
    }

    await db.importRow.update({
      where: { id: row.id },
      data: {
        createdEntity: "Staff",
        createdId: result.staffId,
        // Not the password — never that — just enough for undo to know whether
        // this login is this import's to remove or somebody else's to leave alone.
        parsed: { ...p, userId: result.userId, reusedLogin: Boolean(result.reusedLogin) } as never,
      },
    });
    created++;
    // The password is returned to this call only, never persisted — the same
    // rule createStaff's own comment states. It travels in the action's return
    // value to the screen that just asked for it, and nowhere else.
    issued.push({
      name: input.name,
      employeeId: result.employeeId!,
      firstPassword: result.firstPassword ?? null,
      reusedLogin: Boolean(result.reusedLogin),
    });
  }

  await db.importBatch.update({
    where: { id: batch.id },
    data: { status: "APPLIED", appliedRows: created, appliedAt: new Date() },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "import.apply",
    entity: "ImportBatch",
    entityId: batch.id,
    summary:
      `Imported ${created} staff from ${batch.fileName}` +
      (failures.length ? `, ${failures.length} row(s) could not be written` : ""),
    reversible: true,
    after: { created },
  });

  revalidatePath("/app/import");
  revalidatePath("/app/staff");
  return { ok: true, created, updated: 0, issued, failures };
}

/**
 * Writes each approved row through setClassFees — the same function the
 * structure grid calls — one class at a time, grouping the file's rows by
 * class so a school pricing twelve classes in one sheet makes twelve calls,
 * not one per row. The amount each row is REPLACING is read first and kept on
 * the row, because that is the only way undo can put a price back rather than
 * just deleting it.
 */
async function applyFeeStructureImport(batchId: string) {
  const actor = await requireRole(...MONEY);

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, schoolId: actor.schoolId, kind: "FEE_STRUCTURE" },
    include: { rows: { where: { state: { in: ["OK", "WARNING"] } }, orderBy: { rowNumber: "asc" } } },
  });
  if (!batch) return { error: "That import no longer exists." };
  if (batch.status === "APPLIED") return { error: "This import has already been applied." };
  if (batch.status === "REVERTED") return { error: "This import was undone. Upload the file again." };

  const year = await db.academicYear.findFirst({
    where: { schoolId: actor.schoolId, isCurrent: true },
    select: { id: true },
  });
  if (!year) return { error: "There is no current academic year, so there is nothing to price. Set one first." };

  const byClass = new Map<string, { rowIds: string[]; amounts: Record<string, string> }>();
  for (const row of batch.rows) {
    const p = row.parsed as Record<string, unknown>;
    const classId = typeof p.classId === "string" ? p.classId : null;
    const feeHeadId = typeof p.feeHeadId === "string" ? p.feeHeadId : null;
    const amount = typeof p.amount === "number" ? p.amount : null;
    if (!classId || !feeHeadId || amount == null) continue;

    const entry = byClass.get(classId) ?? { rowIds: [], amounts: {} };
    entry.amounts[feeHeadId] = String(amount / 100);
    entry.rowIds.push(row.id);
    byClass.set(classId, entry);
  }

  let applied = 0;
  for (const [classId, entry] of byClass) {
    const before = await db.feeStructureItem.findMany({
      where: {
        feeHeadId: { in: Object.keys(entry.amounts) },
        feeStructure: { schoolId: actor.schoolId, classId, academicYearId: year.id, isActive: true },
      },
      select: { feeHeadId: true, amount: true },
    });
    const beforeByHead = new Map(before.map((b) => [b.feeHeadId, b.amount]));

    const result = await setClassFees({ classId, amounts: entry.amounts });
    if (result.error) continue;

    const structure = await db.feeStructure.findFirst({
      where: { schoolId: actor.schoolId, classId, academicYearId: year.id, isActive: true },
      select: { id: true },
    });

    for (const row of batch.rows) {
      if (!entry.rowIds.includes(row.id)) continue;
      const p = row.parsed as Record<string, unknown>;
      const feeHeadId = String(p.feeHeadId);
      await db.importRow.update({
        where: { id: row.id },
        data: {
          createdEntity: "FeeStructureItem",
          parsed: {
            ...p,
            structureId: structure?.id ?? null,
            beforeAmountPaise: beforeByHead.get(feeHeadId) ?? null,
          } as never,
        },
      });
      applied++;
    }
  }

  await db.importBatch.update({
    where: { id: batch.id },
    data: { status: "APPLIED", appliedRows: applied, appliedAt: new Date() },
  });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "import.apply",
    entity: "ImportBatch",
    entityId: batch.id,
    summary: `Priced ${byClass.size} class(es) from ${batch.fileName}: ${applied} fee lines set`,
    reversible: true,
    after: { applied },
  });

  revalidatePath("/app/import");
  revalidatePath("/app/fees/structures");
  revalidatePath("/app/fees");
  return { ok: true, created: applied, updated: 0 };
}

/**
 * Step 3 — UNDO. Removes the students this batch created (never the ones it
 * merely updated, and never a student who has since been billed or marked), and
 * the classes and sections it had to invent to place them.
 *
 * This is the single act the whole product is sold on. A school's first fear is
 * losing its data, and the answer to it is not a paragraph about backups — it is
 * importing 847 children in front of the office, removing them again, and the
 * database being exactly as it was. Anything this leaves behind is the clerk
 * watching us fail to keep that promise.
 */
export async function revertImport(batchId: string) {
  const actor = await requireActor();
  const batch = await db.importBatch.findFirst({
    where: { id: batchId, schoolId: actor.schoolId },
    select: { kind: true },
  });
  if (!batch) return { error: "That import no longer exists." };

  if (batch.kind === "STAFF") return revertStaffImport(batchId);
  if (batch.kind === "FEE_STRUCTURE") return revertFeeStructureImport(batchId);
  return revertStudentImport(batchId);
}

async function revertStudentImport(batchId: string) {
  const actor = await requireRole(...OFFICE);

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, schoolId: actor.schoolId },
    include: { rows: { where: { createdId: { not: null } } } },
  });
  if (!batch) return { error: "That import no longer exists." };
  if (batch.status !== "APPLIED") return { error: "Only an applied import can be undone." };

  const ids = batch.rows.map((r) => r.createdId).filter((id): id is string => Boolean(id));

  // Anything with money or marks attached is real school history now. Refuse to
  // delete it silently; tell the office exactly which students were kept.
  const [withInvoices, withAttendance, withResults] = await Promise.all([
    db.feeInvoice.findMany({ where: { studentId: { in: ids } }, select: { studentId: true }, distinct: ["studentId"] }),
    db.attendance.findMany({ where: { studentId: { in: ids } }, select: { studentId: true }, distinct: ["studentId"] }),
    db.examResult.findMany({ where: { studentId: { in: ids } }, select: { studentId: true }, distinct: ["studentId"] }),
  ]);

  const keep = new Set([
    ...withInvoices.map((r) => r.studentId),
    ...withAttendance.map((r) => r.studentId!),
    ...withResults.map((r) => r.studentId),
  ]);
  const deletable = ids.filter((id) => !keep.has(id));

  await db.$transaction(async (tx) => {
    if (deletable.length) {
      await tx.student.deleteMany({ where: { id: { in: deletable }, schoolId: actor.schoolId } });
    }
    await tx.importBatch.update({
      where: { id: batch.id },
      data: { status: "REVERTED", revertedAt: new Date() },
    });
  }, { timeout: 120_000 });

  /*
   * Put back the classes and sections the import invented.
   *
   * Deliberately AFTER the transaction above and not inside it. Removing the
   * children is the undo; tidying up empty classes is housekeeping, and a
   * foreign key we did not anticipate — a timetable period, a fee structure
   * somebody added in the meantime — must not be able to roll back an undo the
   * office has already been told succeeded.
   *
   * Only ever removed when genuinely empty. A class the import created and a
   * clerk has since put a hand-added child into is the school's now, not ours.
   */
  let classesRemoved = 0;
  let sectionsRemoved = 0;
  if (batch.createdClassIds.length || batch.createdSectionIds.length) {
    const sections = await db.section.findMany({
      where: { classId: { in: batch.createdClassIds } },
      select: { id: true, classId: true },
    });
    const remaining = await db.student.groupBy({
      by: ["classId", "sectionId"],
      where: { schoolId: actor.schoolId },
      _count: { _all: true },
    });

    const studentsBySectionId: Record<string, number> = {};
    const studentsByClassId: Record<string, number> = {};
    for (const r of remaining) {
      if (r.sectionId) studentsBySectionId[r.sectionId] = (studentsBySectionId[r.sectionId] ?? 0) + r._count._all;
      if (r.classId) studentsByClassId[r.classId] = (studentsByClassId[r.classId] ?? 0) + r._count._all;
    }
    const sectionIdsByClassId: Record<string, string[]> = {};
    for (const s of sections) {
      (sectionIdsByClassId[s.classId] ??= []).push(s.id);
    }

    // The rule itself lives in the core, with its own tests.
    const removable = removableAfterUndo({
      createdClassIds: batch.createdClassIds,
      createdSectionIds: batch.createdSectionIds,
      studentsBySectionId,
      studentsByClassId,
      sectionIdsByClassId,
    });

    for (const sectionId of removable.sectionIds) {
      try {
        await db.section.delete({ where: { id: sectionId } });
        sectionsRemoved++;
      } catch {
        // A timetable period or a class-teacher link still points at it.
        // Leaving it is the safe answer; the audit line says what stayed.
      }
    }
    for (const classId of removable.classIds) {
      try {
        await db.class.delete({ where: { id: classId } });
        classesRemoved++;
      } catch {
        // Same for a fee structure or an exam hanging off the class.
      }
    }
  }

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "import.revert",
    entity: "ImportBatch",
    entityId: batch.id,
    summary:
      `Undid import of ${batch.fileName}: removed ${deletable.length} students, ` +
      `kept ${keep.size} that already have records, ` +
      `removed ${classesRemoved} classes and ${sectionsRemoved} sections it had created`,
  });

  revalidatePath("/app/import");
  revalidatePath("/app/students");
  return { ok: true, removed: deletable.length, kept: keep.size, classesRemoved, sectionsRemoved };
}

/**
 * Removes the staff this batch created — and, only for a login this import
 * itself made (never one that already existed elsewhere, per `reusedLogin`),
 * the User and its roles too, so undo is symmetric with apply. Anybody who
 * has since marked attendance, drawn a salary, taken an advance, logged CPD
 * hours, held a timetable period or become a class's teacher is kept: that is
 * real school history now, the same principle the student undo uses.
 */
async function revertStaffImport(batchId: string) {
  const actor = await requireRole(...OFFICE);

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, schoolId: actor.schoolId, kind: "STAFF" },
    include: { rows: { where: { createdId: { not: null } } } },
  });
  if (!batch) return { error: "That import no longer exists." };
  if (batch.status !== "APPLIED") return { error: "Only an applied import can be undone." };

  const staffIds = batch.rows.map((r) => r.createdId).filter((id): id is string => Boolean(id));
  const staffRecords = await db.staff.findMany({
    where: { id: { in: staffIds }, schoolId: actor.schoolId },
    select: {
      id: true,
      userId: true,
      _count: {
        select: {
          attendance: true, timetable: true, leaveRequests: true, salaries: true,
          advances: true, cpdRecords: true, lessonPlans: true, homework: true, subjects: true,
        },
      },
    },
  });

  const classTeacherUserIds = new Set(
    (
      await db.section.findMany({
        where: { schoolId: actor.schoolId, classTeacherId: { in: staffRecords.map((s) => s.userId) } },
        select: { classTeacherId: true },
      })
    ).map((s) => s.classTeacherId),
  );

  const deletable = staffRecords.filter((s) => {
    const c = s._count;
    const hasHistory =
      c.attendance > 0 || c.timetable > 0 || c.leaveRequests > 0 || c.salaries > 0 ||
      c.advances > 0 || c.cpdRecords > 0 || c.lessonPlans > 0 || c.homework > 0 || c.subjects > 0;
    return !hasHistory && !classTeacherUserIds.has(s.userId);
  });
  const kept = staffRecords.length - deletable.length;

  const rowByStaffId = new Map(batch.rows.map((r) => [r.createdId as string, r]));
  let usersRemoved = 0;

  await db.$transaction(async (tx) => {
    for (const s of deletable) {
      const p = (rowByStaffId.get(s.id)?.parsed ?? {}) as Record<string, unknown>;

      await tx.staff.delete({ where: { id: s.id } });
      await tx.schoolRole.deleteMany({ where: { userId: s.userId, schoolId: actor.schoolId } });

      // Only a login this import created is this import's to remove.
      if (p.reusedLogin !== true) {
        const [otherRoles, otherLinks] = await Promise.all([
          tx.schoolRole.count({ where: { userId: s.userId } }),
          tx.parentLink.count({ where: { userId: s.userId } }),
        ]);
        const student = await tx.student.findUnique({ where: { userId: s.userId }, select: { id: true } });
        if (otherRoles === 0 && otherLinks === 0 && !student) {
          try {
            await tx.user.delete({ where: { id: s.userId } });
            usersRemoved++;
          } catch {
            // Some other reference we did not anticipate. Leaving the login in
            // place is the safe answer — it is orphaned, not broken.
          }
        }
      }
    }
    await tx.importBatch.update({
      where: { id: batch.id },
      data: { status: "REVERTED", revertedAt: new Date() },
    });
  }, { timeout: 120_000 });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "import.revert",
    entity: "ImportBatch",
    entityId: batch.id,
    summary:
      `Undid staff import of ${batch.fileName}: removed ${deletable.length} staff (${usersRemoved} logins with them), ` +
      `kept ${kept} who already have attendance, pay, CPD hours, a timetable, or a class`,
  });

  revalidatePath("/app/import");
  revalidatePath("/app/staff");
  return { ok: true, removed: deletable.length, kept };
}

/**
 * Puts back the amount each row REPLACED (or removes the line entirely if the
 * head was not priced for that class before), reading it from
 * parsed.beforeAmountPaise which applyFeeStructureImport recorded at the
 * moment it overwrote it. Invoices already raised are untouched either way —
 * they carry their own copy of every line, same as setClassFees promises.
 */
async function revertFeeStructureImport(batchId: string) {
  const actor = await requireRole(...MONEY);

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, schoolId: actor.schoolId, kind: "FEE_STRUCTURE" },
    include: { rows: { where: { createdEntity: "FeeStructureItem" } } },
  });
  if (!batch) return { error: "That import no longer exists." };
  if (batch.status !== "APPLIED") return { error: "Only an applied import can be undone." };

  let restored = 0;
  let removed = 0;

  await db.$transaction(async (tx) => {
    for (const row of batch.rows) {
      const p = row.parsed as Record<string, unknown>;
      const structureId = typeof p.structureId === "string" ? p.structureId : null;
      const feeHeadId = typeof p.feeHeadId === "string" ? p.feeHeadId : null;
      if (!structureId || !feeHeadId) continue;

      const before = typeof p.beforeAmountPaise === "number" ? p.beforeAmountPaise : null;
      if (before == null) {
        await tx.feeStructureItem
          .delete({ where: { feeStructureId_feeHeadId: { feeStructureId: structureId, feeHeadId } } })
          .then(() => removed++)
          .catch(() => {
            // An invoice may have been raised off this line since, or it was
            // already zeroed by hand — either way, leaving it is the safe answer.
          });
      } else {
        await tx.feeStructureItem
          .upsert({
            where: { feeStructureId_feeHeadId: { feeStructureId: structureId, feeHeadId } },
            create: { feeStructureId: structureId, feeHeadId, amount: before },
            update: { amount: before },
          })
          .then(() => restored++)
          .catch(() => {
            // The structure or head itself was removed since — nothing left to restore.
          });
      }
    }

    await tx.importBatch.update({
      where: { id: batch.id },
      data: { status: "REVERTED", revertedAt: new Date() },
    });
  }, { timeout: 120_000 });

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "import.revert",
    entity: "ImportBatch",
    entityId: batch.id,
    summary: `Undid fee-structure import of ${batch.fileName}: restored ${restored} amount(s), removed ${removed} line(s) that did not exist before it`,
  });

  revalidatePath("/app/import");
  revalidatePath("/app/fees/structures");
  revalidatePath("/app/fees");
  return { ok: true, removed, kept: restored };
}

export async function discardImport(batchId: string) {
  const actor = await requireRole(...OFFICE);
  const batch = await db.importBatch.findFirst({ where: { id: batchId, schoolId: actor.schoolId } });
  if (!batch) return { error: "That import no longer exists." };
  if (batch.status === "APPLIED") return { error: "Undo it instead — it has already been applied." };

  await db.importBatch.update({ where: { id: batch.id }, data: { status: "DISCARDED" } });
  revalidatePath("/app/import");
  redirect("/app/import");
}

/**
 * Validated rows are stored as JSON, so a Date written at validation time comes
 * back as an ISO string. Without this every imported date would silently vanish.
 */
function asDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" && v !== "") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function str(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** "5" / "V" / "class 5" all become "Class 5". */
