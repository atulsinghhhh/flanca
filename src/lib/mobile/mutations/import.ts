import { db } from "@/lib/db";
import { audit, hasRole, OFFICE, MONEY, type Actor } from "@/lib/session";
import { parseWorkbook } from "@/lib/import/parse";
import {
  FEE_STRUCTURE_FIELDS, mapColumns, normaliseHeader, removableAfterUndo,
  STAFF_FIELDS, STUDENT_FIELDS, summariseBatch, validateFeeStructureRow, validateRow, validateStaffRow,
  type RowMessage,
} from "@/lib/core/import-core";
import { classOrderFor, tidyClassName } from "@/lib/core/setup-core";
import { createStaffForActor, type StaffInput } from "./staff";
import { setClassFeesForActor } from "./fee-structures";

/**
 * The mobile-API twin of src/app/app/import/actions.ts — same read-everything-
 * before-writing-anything promise, same undo guarantees, just handed an
 * `actor` instead of calling `requireRole()`/`redirect()`, and returning a
 * discriminated result instead of `{error}`/throwing so a route handler can
 * turn it into the right HTTP status. Each function keeps its own role check
 * (students/staff need OFFICE, fee structure needs MONEY) because the route
 * layer can't know which one a batch needs until it reads the batch's kind.
 */

const MAX_ROWS = 5000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type Failure = { ok: false; status: number; code: string; message: string };
const notFound = (message: string): Failure => ({ ok: false, status: 404, code: "not_found", message });
const invalid = (message: string): Failure => ({ ok: false, status: 422, code: "invalid_input", message });
const conflict = (message: string): Failure => ({ ok: false, status: 409, code: "conflict", message });
const forbidden = (message: string): Failure => ({ ok: false, status: 403, code: "forbidden", message });

export type UploadResult =
  | Failure
  | { ok: true; batchId: string; totalRows: number; okRows: number; warningRows: number; errorRows: number };

/** Step 1 — upload and VALIDATE. Nothing is written to the school's records here. */
export async function uploadStudentFileForActor(actor: Actor, file: File): Promise<UploadResult> {
  if (!hasRole(actor, ...OFFICE)) return forbidden("You do not have access to import students.");
  if (file.size === 0) return invalid("Choose a file first.");
  if (file.size > MAX_FILE_BYTES) return invalid("That file is larger than 10 MB. Split it and import in two passes.");

  let parsed;
  try {
    parsed = parseWorkbook(await file.arrayBuffer());
  } catch {
    return invalid("We could not read that file. Save it as .xlsx or .csv and try again.");
  }
  if (parsed.rows.length === 0) return invalid("That file has no data rows we can read.");
  if (parsed.rows.length > MAX_ROWS) return invalid(`That file has ${parsed.rows.length} rows. Import at most ${MAX_ROWS} at a time.`);

  const columnMap = mapColumns(parsed.headers, STUDENT_FIELDS);
  const seen = new Set<string>();
  const validated = parsed.rows.map((raw, i) =>
    validateRow({ rowNumber: i + 2, raw, columnMap, specs: STUDENT_FIELDS, seenAdmissionNumbers: seen }),
  );

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

  return {
    ok: true,
    batchId: batch.id,
    totalRows: summary.totalRows,
    okRows: summary.okRows,
    warningRows: summary.warningRows,
    errorRows: summary.errorRows,
  };
}

/** Step 1 — upload and VALIDATE a staff sheet. Same promise: nothing is written yet. */
export async function uploadStaffFileForActor(actor: Actor, file: File): Promise<UploadResult> {
  if (!hasRole(actor, ...OFFICE)) return forbidden("You do not have access to import staff.");
  if (file.size === 0) return invalid("Choose a file first.");
  if (file.size > MAX_FILE_BYTES) return invalid("That file is larger than 10 MB. Split it and import in two passes.");

  let parsed;
  try {
    parsed = parseWorkbook(await file.arrayBuffer());
  } catch {
    return invalid("We could not read that file. Save it as .xlsx or .csv and try again.");
  }
  if (parsed.rows.length === 0) return invalid("That file has no data rows we can read.");
  if (parsed.rows.length > MAX_ROWS) return invalid(`That file has ${parsed.rows.length} rows. Import at most ${MAX_ROWS} at a time.`);

  const columnMap = mapColumns(parsed.headers, STAFF_FIELDS);
  const seen = new Set<string>();
  const validated = parsed.rows.map((raw, i) => validateStaffRow({ rowNumber: i + 2, raw, columnMap, seenEmails: seen }));

  const incoming = validated.map((r) => r.parsed.email as string | undefined).filter((v): v is string => Boolean(v));
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

  return {
    ok: true,
    batchId: batch.id,
    totalRows: summary.totalRows,
    okRows: summary.okRows,
    warningRows: summary.warningRows,
    errorRows: summary.errorRows,
  };
}

/** Step 1 — upload and VALIDATE a fee-structure sheet: one row per class + fee head. */
export async function uploadFeeStructureFileForActor(actor: Actor, file: File): Promise<UploadResult> {
  if (!hasRole(actor, ...MONEY)) return forbidden("You do not have access to import fees.");
  if (file.size === 0) return invalid("Choose a file first.");
  if (file.size > MAX_FILE_BYTES) return invalid("That file is larger than 10 MB. Split it and import in two passes.");

  let parsed;
  try {
    parsed = parseWorkbook(await file.arrayBuffer());
  } catch {
    return invalid("We could not read that file. Save it as .xlsx or .csv and try again.");
  }
  if (parsed.rows.length === 0) return invalid("That file has no data rows we can read.");
  if (parsed.rows.length > MAX_ROWS) return invalid(`That file has ${parsed.rows.length} rows. Import at most ${MAX_ROWS} at a time.`);

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

  return {
    ok: true,
    batchId: batch.id,
    totalRows: summary.totalRows,
    okRows: summary.okRows,
    warningRows: summary.warningRows,
    errorRows: summary.errorRows,
  };
}

export type ListBatchesResult = Failure | { ok: true; batches: Awaited<ReturnType<typeof listBatches>> };

async function listBatches(schoolId: string, limit: number) {
  return db.importBatch.findMany({
    where: { schoolId },
    orderBy: { uploadedAt: "desc" },
    take: limit,
    include: { user: { select: { name: true } } },
  });
}

/** Mirrors the history table on src/app/app/import/page.tsx. */
export async function listImportBatchesForActor(actor: Actor, limit = 20): Promise<ListBatchesResult> {
  return { ok: true, batches: await listBatches(actor.schoolId, limit) };
}

const SHOW_LIMIT = 250;

export type BatchDetailResult =
  | Failure
  | {
      ok: true;
      batch: NonNullable<Awaited<ReturnType<typeof findBatch>>>;
      problemRows: Awaited<ReturnType<typeof findProblemRows>>;
      cleanRows: Awaited<ReturnType<typeof findCleanRows>>;
    };

function findBatch(id: string, schoolId: string) {
  return db.importBatch.findFirst({ where: { id, schoolId }, include: { user: { select: { name: true } } } });
}
function findProblemRows(batchId: string) {
  return db.importRow.findMany({
    where: { batchId, state: { in: ["ERROR", "WARNING"] } },
    orderBy: { rowNumber: "asc" },
    take: SHOW_LIMIT,
  });
}
function findCleanRows(batchId: string) {
  return db.importRow.findMany({ where: { batchId, state: "OK" }, orderBy: { rowNumber: "asc" }, take: SHOW_LIMIT });
}

/** Mirrors src/app/app/import/[id]/page.tsx: the batch plus the rows needing a look and the clean rows. */
export async function getImportBatchForActor(actor: Actor, batchId: string): Promise<BatchDetailResult> {
  const batch = await findBatch(batchId, actor.schoolId);
  if (!batch) return notFound("That import no longer exists.");

  const [problemRows, cleanRows] = await Promise.all([findProblemRows(batch.id), findCleanRows(batch.id)]);
  return { ok: true, batch, problemRows, cleanRows };
}

export type ApplyResult =
  | Failure
  | { ok: true; created: number; updated: number; issued?: unknown[]; failures?: unknown[] };

/**
 * Step 2 — APPLY. Every kind of import is checked and shown before anything is
 * written, so this just routes to the writer for the kind this batch is —
 * each keeps its own role check, since a fee structure needs MONEY and a
 * roster or a staff list needs only OFFICE.
 */
export async function applyImportForActor(actor: Actor, batchId: string): Promise<ApplyResult> {
  const batch = await db.importBatch.findFirst({ where: { id: batchId, schoolId: actor.schoolId }, select: { kind: true } });
  if (!batch) return notFound("That import no longer exists.");

  if (batch.kind === "STAFF") return applyStaffImport(actor, batchId);
  if (batch.kind === "FEE_STRUCTURE") return applyFeeStructureImport(actor, batchId);
  return applyStudentImport(actor, batchId);
}

/** Runs in one transaction so a failure halfway cannot leave the roster half-imported. */
async function applyStudentImport(actor: Actor, batchId: string): Promise<ApplyResult> {
  if (!hasRole(actor, ...OFFICE)) return forbidden("You do not have access to apply this import.");

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, schoolId: actor.schoolId },
    include: { rows: { where: { state: { in: ["OK", "WARNING"] } }, orderBy: { rowNumber: "asc" } } },
  });
  if (!batch) return notFound("That import no longer exists.");
  if (batch.status === "APPLIED") return conflict("This import has already been applied.");
  if (batch.status === "REVERTED") return conflict("This import was undone. Upload the file again.");

  const classes = await db.class.findMany({ where: { schoolId: actor.schoolId }, include: { sections: true } });
  const classByName = new Map(classes.map((c) => [normalise(c.name), c]));

  let created = 0;
  let updated = 0;
  const createdClassIds: string[] = [];
  const createdSectionIds: string[] = [];

  await db.$transaction(
    async (tx) => {
      for (const row of batch.rows) {
        const p = row.parsed as Record<string, unknown>;
        const admissionNumber = String(p.admissionNumber ?? "").trim();
        if (!admissionNumber) continue;

        let classId: string | null = null;
        let sectionId: string | null = null;

        const className = p.className ? String(p.className).trim() : "";
        if (className) {
          const tidied = tidyClassName(className);
          const key = normalise(tidied);
          let cls = classByName.get(key);
          if (!cls) {
            const fresh = await tx.class.create({
              data: { schoolId: actor.schoolId, name: tidied, sequenceOrder: classOrderFor(tidied) },
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
              section = await tx.section.create({ data: { schoolId: actor.schoolId, classId: cls.id, name: sectionName } });
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
        } as const;

        const existing = await tx.student.findUnique({
          where: { schoolId_admissionNumber: { schoolId: actor.schoolId, admissionNumber } },
          select: { id: true },
        });

        if (existing) {
          await tx.student.update({ where: { id: existing.id }, data });
          await tx.importRow.update({ where: { id: row.id }, data: { createdEntity: "Student", createdId: existing.id } });
          updated++;
        } else {
          const student = await tx.student.create({ data: { schoolId: actor.schoolId, admissionNumber, status: "ACTIVE", ...data } });
          await tx.importRow.update({ where: { id: row.id }, data: { createdEntity: "Student", createdId: student.id } });
          created++;
        }
      }

      await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: "APPLIED", appliedRows: created + updated, appliedAt: new Date(), createdClassIds, createdSectionIds },
      });
    },
    { timeout: 120_000 },
  );

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

  return { ok: true, created, updated };
}

/**
 * Writes each approved row through createStaffForActor — the same function
 * the "Add staff" screen calls — so an imported member of staff gets the same
 * User, SchoolRole and Staff rows, the same first password, and the same
 * audit line as one added by hand.
 */
async function applyStaffImport(actor: Actor, batchId: string): Promise<ApplyResult> {
  if (!hasRole(actor, ...OFFICE)) return forbidden("You do not have access to apply this import.");

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, schoolId: actor.schoolId, kind: "STAFF" },
    include: { rows: { where: { state: { in: ["OK", "WARNING"] } }, orderBy: { rowNumber: "asc" } } },
  });
  if (!batch) return notFound("That import no longer exists.");
  if (batch.status === "APPLIED") return conflict("This import has already been applied.");
  if (batch.status === "REVERTED") return conflict("This import was undone. Upload the file again.");

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
    };

    const result = await createStaffForActor(actor, input);
    if (!result.ok) {
      failures.push({ rowNumber: row.rowNumber, message: result.message });
      const existingMessages = (row.messages ?? []) as RowMessage[];
      const messages = [...existingMessages, { field: "email", level: "ERROR" as const, message: `Not imported: ${result.message}` }];
      await db.importRow.update({ where: { id: row.id }, data: { messages: messages as never } });
      continue;
    }

    const staffRow = await db.staff.findUnique({ where: { id: result.staffId }, select: { userId: true } });
    await db.importRow.update({
      where: { id: row.id },
      data: {
        createdEntity: "Staff",
        createdId: result.staffId,
        parsed: { ...p, userId: staffRow?.userId, reusedLogin: result.reusedLogin } as never,
      },
    });
    created++;
    issued.push({ name: input.name, employeeId: result.employeeId, firstPassword: result.firstPassword, reusedLogin: result.reusedLogin });
  }

  await db.importBatch.update({ where: { id: batch.id }, data: { status: "APPLIED", appliedRows: created, appliedAt: new Date() } });

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

  return { ok: true, created, updated: 0, issued, failures };
}

/**
 * Writes each approved row through setClassFeesForActor — the same function
 * the structure grid calls — one class at a time. The amount each row is
 * REPLACING is read first and kept on the row, because that is the only way
 * undo can put a price back rather than just deleting it.
 */
async function applyFeeStructureImport(actor: Actor, batchId: string): Promise<ApplyResult> {
  if (!hasRole(actor, ...MONEY)) return forbidden("You do not have access to apply this import.");

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, schoolId: actor.schoolId, kind: "FEE_STRUCTURE" },
    include: { rows: { where: { state: { in: ["OK", "WARNING"] } }, orderBy: { rowNumber: "asc" } } },
  });
  if (!batch) return notFound("That import no longer exists.");
  if (batch.status === "APPLIED") return conflict("This import has already been applied.");
  if (batch.status === "REVERTED") return conflict("This import was undone. Upload the file again.");

  const year = await db.academicYear.findFirst({ where: { schoolId: actor.schoolId, isCurrent: true }, select: { id: true } });
  if (!year) return conflict("There is no current academic year, so there is nothing to price. Set one first.");

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

    const result = await setClassFeesForActor(actor, { classId, amounts: entry.amounts });
    if (!result.ok) continue;

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
          parsed: { ...p, structureId: structure?.id ?? null, beforeAmountPaise: beforeByHead.get(feeHeadId) ?? null } as never,
        },
      });
      applied++;
    }
  }

  await db.importBatch.update({ where: { id: batch.id }, data: { status: "APPLIED", appliedRows: applied, appliedAt: new Date() } });

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

  return { ok: true, created: applied, updated: 0 };
}

export type RevertResult =
  | Failure
  | { ok: true; removed: number; kept: number; classesRemoved?: number; sectionsRemoved?: number };

/**
 * Step 3 — UNDO. This is the single act the whole product is sold on: importing
 * hundreds of children in front of the office, removing them again, and the
 * database being exactly as it was. Anything this leaves behind is us failing
 * to keep that promise, so the same "keep anything with real history" rule
 * applies here as on the web.
 */
export async function revertImportForActor(actor: Actor, batchId: string): Promise<RevertResult> {
  const batch = await db.importBatch.findFirst({ where: { id: batchId, schoolId: actor.schoolId }, select: { kind: true } });
  if (!batch) return notFound("That import no longer exists.");

  if (batch.kind === "STAFF") return revertStaffImport(actor, batchId);
  if (batch.kind === "FEE_STRUCTURE") return revertFeeStructureImport(actor, batchId);
  return revertStudentImport(actor, batchId);
}

async function revertStudentImport(actor: Actor, batchId: string): Promise<RevertResult> {
  if (!hasRole(actor, ...OFFICE)) return forbidden("You do not have access to undo this import.");

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, schoolId: actor.schoolId },
    include: { rows: { where: { createdId: { not: null } } } },
  });
  if (!batch) return notFound("That import no longer exists.");
  if (batch.status !== "APPLIED") return conflict("Only an applied import can be undone.");

  const ids = batch.rows.map((r) => r.createdId).filter((id): id is string => Boolean(id));

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

  await db.$transaction(
    async (tx) => {
      if (deletable.length) {
        await tx.student.deleteMany({ where: { id: { in: deletable }, schoolId: actor.schoolId } });
      }
      await tx.importBatch.update({ where: { id: batch.id }, data: { status: "REVERTED", revertedAt: new Date() } });
    },
    { timeout: 120_000 },
  );

  let classesRemoved = 0;
  let sectionsRemoved = 0;
  if (batch.createdClassIds.length || batch.createdSectionIds.length) {
    const sections = await db.section.findMany({ where: { classId: { in: batch.createdClassIds } }, select: { id: true, classId: true } });
    const remaining = await db.student.groupBy({ by: ["classId", "sectionId"], where: { schoolId: actor.schoolId }, _count: { _all: true } });

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
        // A timetable period or a class-teacher link still points at it. Leaving it is the safe answer.
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

  return { ok: true, removed: deletable.length, kept: keep.size, classesRemoved, sectionsRemoved };
}

async function revertStaffImport(actor: Actor, batchId: string): Promise<RevertResult> {
  if (!hasRole(actor, ...OFFICE)) return forbidden("You do not have access to undo this import.");

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, schoolId: actor.schoolId, kind: "STAFF" },
    include: { rows: { where: { createdId: { not: null } } } },
  });
  if (!batch) return notFound("That import no longer exists.");
  if (batch.status !== "APPLIED") return conflict("Only an applied import can be undone.");

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

  await db.$transaction(
    async (tx) => {
      for (const s of deletable) {
        const p = (rowByStaffId.get(s.id)?.parsed ?? {}) as Record<string, unknown>;

        await tx.staff.delete({ where: { id: s.id } });
        await tx.schoolRole.deleteMany({ where: { userId: s.userId, schoolId: actor.schoolId } });

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
              // Some other reference we did not anticipate. Leaving the login in place is the safe answer.
            }
          }
        }
      }
      await tx.importBatch.update({ where: { id: batch.id }, data: { status: "REVERTED", revertedAt: new Date() } });
    },
    { timeout: 120_000 },
  );

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

  return { ok: true, removed: deletable.length, kept };
}

async function revertFeeStructureImport(actor: Actor, batchId: string): Promise<RevertResult> {
  if (!hasRole(actor, ...MONEY)) return forbidden("You do not have access to undo this import.");

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, schoolId: actor.schoolId, kind: "FEE_STRUCTURE" },
    include: { rows: { where: { createdEntity: "FeeStructureItem" } } },
  });
  if (!batch) return notFound("That import no longer exists.");
  if (batch.status !== "APPLIED") return conflict("Only an applied import can be undone.");

  let restored = 0;
  let removed = 0;

  await db.$transaction(
    async (tx) => {
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
              // An invoice may have been raised off this line since, or it was already zeroed by hand.
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

      await tx.importBatch.update({ where: { id: batch.id }, data: { status: "REVERTED", revertedAt: new Date() } });
    },
    { timeout: 120_000 },
  );

  await audit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: "import.revert",
    entity: "ImportBatch",
    entityId: batch.id,
    summary: `Undid fee-structure import of ${batch.fileName}: restored ${restored} amount(s), removed ${removed} line(s) that did not exist before it`,
  });

  return { ok: true, removed, kept: restored };
}

export type DiscardResult = Failure | { ok: true };

export async function discardImportForActor(actor: Actor, batchId: string): Promise<DiscardResult> {
  if (!hasRole(actor, ...OFFICE)) return forbidden("You do not have access to discard this import.");

  const batch = await db.importBatch.findFirst({ where: { id: batchId, schoolId: actor.schoolId } });
  if (!batch) return notFound("That import no longer exists.");
  if (batch.status === "APPLIED") return conflict("Undo it instead — it has already been applied.");

  await db.importBatch.update({ where: { id: batch.id }, data: { status: "DISCARDED" } });
  return { ok: true };
}

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
