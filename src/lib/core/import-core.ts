/**
 * Migration engine. Pure validation + column mapping.
 *
 * The #1 reason Indian schools don't switch software is FEAR OF DATA LOSS, so an
 * import here is a reviewable object: every row is validated and shown to the
 * principal BEFORE anything is written, and the whole batch can be undone.
 * Nobody else in this market lets a school watch the import before it lands.
 */

import { classOrderFor, parseClassAndSection, scrubCell, tidyClassName, tidySectionName, validateFeeAmount } from "./setup-core";
import { validateStaffDetails } from "./staff-core";

export type FieldSpec = {
  field: string;
  label: string;
  required?: boolean;
  /** header spellings seen in real school Excel files */
  aliases: string[];
  kind: "string" | "int" | "date" | "gender" | "money" | "phone" | "email" | "roles";
};

export const STUDENT_FIELDS: FieldSpec[] = [
  { field: "admissionNumber", label: "Admission No", required: true, kind: "string",
    aliases: ["admission no", "admission number", "adm no", "adm.no", "admno", "enrollment no", "sr no", "scholar no", "student id"] },
  { field: "name", label: "Student Name", required: true, kind: "string",
    aliases: ["name", "student name", "name of student", "student", "full name", "child name"] },
  { field: "className", label: "Class", required: false, kind: "string",
    aliases: ["class", "std", "standard", "grade", "class name"] },
  { field: "sectionName", label: "Section", required: false, kind: "string",
    aliases: ["section", "sec", "div", "division", "class section"] },
  { field: "rollNumber", label: "Roll No", required: false, kind: "int",
    aliases: ["roll no", "roll number", "rollno", "roll"] },
  { field: "gender", label: "Gender", required: false, kind: "gender",
    aliases: ["gender", "sex", "m/f"] },
  { field: "dob", label: "Date of Birth", required: false, kind: "date",
    aliases: ["dob", "date of birth", "birth date", "d.o.b", "dob (dd/mm/yyyy)"] },
  { field: "fatherName", label: "Father's Name", required: false, kind: "string",
    aliases: ["father name", "father's name", "fathers name", "father", "guardian name", "parent name"] },
  { field: "motherName", label: "Mother's Name", required: false, kind: "string",
    aliases: ["mother name", "mother's name", "mothers name", "mother"] },
  { field: "guardianPhone", label: "Parent Mobile", required: false, kind: "phone",
    aliases: ["mobile", "phone", "contact", "parent mobile", "mobile no", "contact no", "father mobile", "whatsapp"] },
  { field: "guardianEmail", label: "Parent Email", required: false, kind: "email",
    aliases: ["email", "email id", "parent email", "e-mail"] },
  { field: "address", label: "Address", required: false, kind: "string",
    aliases: ["address", "residential address", "addr"] },
  { field: "category", label: "Category", required: false, kind: "string",
    aliases: ["category", "caste", "social category", "cat"] },
  { field: "bloodGroup", label: "Blood Group", required: false, kind: "string",
    aliases: ["blood group", "blood", "bg"] },
  { field: "apaarId", label: "APAAR ID", required: false, kind: "string",
    aliases: ["apaar", "apaar id", "apaar no", "one nation one student id"] },
  { field: "penNumber", label: "PEN", required: false, kind: "string",
    aliases: ["pen", "pen number", "pen no", "permanent education number"] },
  { field: "aadhaarName", label: "Name as per Aadhaar", required: false, kind: "string",
    aliases: ["aadhaar name", "name as per aadhaar", "aadhar name", "uid name"] },
  { field: "admissionDate", label: "Admission Date", required: false, kind: "date",
    aliases: ["admission date", "doa", "date of admission", "joining date"] },
  /*
   * Name parts, for the very common file that has no single "Name" column.
   * These are mappable in the UI and are NOT student fields — the writer reads
   * `name` and never looks at them. validateRow joins whichever are present
   * into `name` before the required check runs, because otherwise a file with
   * First/Last columns is a file where every single row is a hard error and the
   * clerk concludes the importer cannot read their data.
   */
  { field: "firstName", label: "First Name", required: false, kind: "string",
    aliases: ["first name", "firstname", "given name", "student first name", "fname", "f name"] },
  { field: "middleName", label: "Middle Name", required: false, kind: "string",
    aliases: ["middle name", "middlename", "mname"] },
  { field: "lastName", label: "Last Name", required: false, kind: "string",
    aliases: ["last name", "lastname", "surname", "sur name", "family name", "lname"] },
];

/**
 * A member of staff, imported the same way a roster is: uploaded, checked row
 * by row, approved.
 *
 * Required-ness is deliberately NOT marked here for name/email/roles — that
 * rule already lives in staff-core's validateStaffDetails, which createStaff
 * also calls, and duplicating "name is required" here would mean an empty
 * name earns two different error messages instead of one correct one.
 */
export const STAFF_FIELDS: FieldSpec[] = [
  { field: "name", label: "Name", required: false, kind: "string",
    aliases: ["name", "full name", "staff name", "employee name", "teacher name"] },
  { field: "email", label: "Email", required: false, kind: "email",
    aliases: ["email", "email id", "e-mail", "login email"] },
  { field: "phone", label: "Mobile", required: false, kind: "string",
    aliases: ["mobile", "phone", "contact", "mobile no", "contact no", "phone number"] },
  { field: "employeeId", label: "Employee Id", required: false, kind: "string",
    aliases: ["employee id", "emp id", "emp no", "staff id", "employee code", "emp code"] },
  { field: "designation", label: "Designation", required: false, kind: "string",
    aliases: ["designation", "post", "title", "job title"] },
  { field: "department", label: "Department", required: false, kind: "string",
    aliases: ["department", "dept"] },
  { field: "qualification", label: "Qualification", required: false, kind: "string",
    aliases: ["qualification", "qualifications", "highest qualification"] },
  { field: "roles", label: "Roles", required: false, kind: "roles",
    aliases: ["role", "roles", "access", "what they can open", "designation type"] },
  { field: "basicPay", label: "Basic Pay (monthly)", required: false, kind: "money",
    aliases: ["basic pay", "salary", "basic", "monthly salary", "basic salary", "pay"] },
  { field: "joiningDate", label: "Joining Date", required: false, kind: "date",
    aliases: ["joining date", "date of joining", "doj", "joining"] },
  { field: "dob", label: "Date of Birth", required: false, kind: "date",
    aliases: ["dob", "date of birth", "birth date", "d.o.b"] },
  { field: "gender", label: "Gender", required: false, kind: "gender",
    aliases: ["gender", "sex", "m/f"] },
  { field: "address", label: "Address", required: false, kind: "string",
    aliases: ["address", "residential address"] },
  { field: "panNumber", label: "PAN", required: false, kind: "string",
    aliases: ["pan", "pan number", "pan no"] },
  { field: "bankAccountNo", label: "Bank Account No", required: false, kind: "string",
    aliases: ["bank account no", "account no", "bank a/c", "account number"] },
  { field: "bankIfsc", label: "IFSC", required: false, kind: "string",
    aliases: ["ifsc", "ifsc code"] },
];

/**
 * What one class pays for one fee head. One row per (class, head) pair, so a
 * school with 12 classes and 6 heads sends 72 short rows rather than a wide
 * sheet whose columns depend on which heads this particular school happens to
 * have — which setClassFees's own shape (a map keyed by fee head id) mirrors.
 */
export const FEE_STRUCTURE_FIELDS: FieldSpec[] = [
  { field: "className", label: "Class", required: true, kind: "string",
    aliases: ["class", "std", "standard", "grade", "class name"] },
  { field: "feeHeadName", label: "Fee Head", required: true, kind: "string",
    aliases: ["fee head", "head", "fee name", "charge", "fee head name"] },
  { field: "amount", label: "Amount (a year, in Rs)", required: true, kind: "money",
    aliases: ["amount", "fee amount", "amount (rs)", "amount (inr)", "price", "annual amount", "charge amount"] },
];

/** Best-effort automatic column mapping so the clerk usually confirms, not configures. */
export function mapColumns(
  headers: string[],
  specs: FieldSpec[] = STUDENT_FIELDS,
): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  const used = new Set<string>();

  for (const spec of specs) {
    const hit = headers.find((h) => {
      if (used.has(h)) return false;
      const norm = normaliseHeader(h);
      return norm === normaliseHeader(spec.label) || spec.aliases.some((a) => normaliseHeader(a) === norm);
    });
    if (hit) {
      map[spec.field] = hit;
      used.add(hit);
    } else {
      map[spec.field] = null;
    }
  }

  return map;
}

export function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type RowMessage = { field: string; level: "ERROR" | "WARNING"; message: string };

export type ValidatedRow = {
  rowNumber: number;
  raw: Record<string, unknown>;
  parsed: Record<string, unknown>;
  state: "OK" | "WARNING" | "ERROR";
  messages: RowMessage[];
};

/** Reads one field out of a raw row via the detected column map, scrubbing the cell. */
function cellReader(raw: Record<string, unknown>, columnMap: Record<string, string | null>) {
  return (field: string): string => {
    const source = columnMap[field];
    const value = source ? raw[source] : undefined;
    return value == null ? "" : scrubCell(String(value));
  };
}

function rowState(messages: RowMessage[]): "OK" | "WARNING" | "ERROR" {
  return messages.some((m) => m.level === "ERROR") ? "ERROR" : messages.length > 0 ? "WARNING" : "OK";
}

/**
 * The part of row validation that is the same for every kind of import: read
 * each field by its detected column, coerce it by its `kind`, and complain —
 * never invent — when a cell doesn't fit. What each import DOES with the
 * result (class/section resolution for students, staff-core's rules for
 * staff, a fee head lookup for fee structures) is kind-specific and lives
 * outside this function.
 */
function parseFieldSpecs(
  specs: FieldSpec[],
  cell: (field: string) => string,
): { parsed: Record<string, unknown>; messages: RowMessage[] } {
  const messages: RowMessage[] = [];
  const parsed: Record<string, unknown> = {};

  for (const spec of specs) {
    const text = cell(spec.field);

    if (text === "") {
      if (spec.required) {
        messages.push({ field: spec.field, level: "ERROR", message: `${spec.label} is required` });
      }
      continue;
    }

    switch (spec.kind) {
      case "int": {
        const n = Number(text.replace(/[^0-9-]/g, ""));
        if (!Number.isFinite(n)) {
          messages.push({ field: spec.field, level: "WARNING", message: `${spec.label} "${text}" is not a number — skipped` });
        } else {
          parsed[spec.field] = n;
        }
        break;
      }
      case "date": {
        const d = parseIndianDate(text);
        if (!d) {
          messages.push({ field: spec.field, level: "WARNING", message: `${spec.label} "${text}" is not a date we recognise — skipped` });
        } else {
          parsed[spec.field] = d;
        }
        break;
      }
      case "gender": {
        const g = parseGender(text);
        if (!g) {
          messages.push({ field: spec.field, level: "WARNING", message: `Gender "${text}" not recognised — skipped` });
        } else {
          parsed[spec.field] = g;
        }
        break;
      }
      case "phone": {
        /*
         * One cell, often two numbers: "9876543210 / 9812345678", or
         * "98765 43210, 0120-2345678". Mashing every digit together made a
         * 20-digit string and threw the warning away with the number — so a
         * parent whose mobile WAS in the file still got no messages.
         *
         * A mobile in India starts 6-9 and is ten digits. Take the first run
         * that qualifies, keep it, and say so when a second was discarded.
         */
        const tidyDigits = (part: string) =>
          part.replace(/\D/g, "").replace(/^0+/, "").replace(/^91(?=\d{10}$)/, "");
        const isMobile = (d: string) => /^[6-9]\d{9}$/.test(d);

        // The whole cell FIRST. "+91 98765 43210" is one number written with
        // spaces, and splitting on them turns it into three fragments that are
        // each invalid — so the common case has to be tried before the
        // two-numbers case, not after it.
        const whole = tidyDigits(text);
        const candidates = text.split(/[^0-9+]+/).map(tidyDigits).filter((d) => d !== "");
        const mobile = isMobile(whole) ? whole : candidates.find(isMobile);

        if (mobile) {
          parsed[spec.field] = mobile;
          if (mobile !== whole && candidates.length > 1) {
            messages.push({ field: spec.field, level: "WARNING", message: `"${text}" holds more than one number — using ${mobile}` });
          }
        } else {
          messages.push({ field: spec.field, level: "WARNING", message: `Mobile "${text}" is not a 10-digit Indian mobile — parent will not get messages` });
          const longest = candidates.sort((a, b) => b.length - a.length)[0];
          if (longest) parsed[spec.field] = longest;
        }
        break;
      }
      case "money": {
        // "₹1,200", "1,200.00", "1200/-" — a rupee sign and thousands separators
        // are how a human writes money and how a spreadsheet stores it as text.
        // Stored in PAISE, because everything downstream of here is integer
        // paise and a float rupee amount is how fee totals drift.
        const cleaned = text.replace(/[₹rs.\s,/-]/gi, "");
        const rupees = Number(cleaned);
        if (!Number.isFinite(rupees) || cleaned === "") {
          messages.push({ field: spec.field, level: "WARNING", message: `${spec.label} "${text}" is not an amount — skipped` });
        } else {
          parsed[spec.field] = Math.round(rupees * 100);
        }
        break;
      }
      case "email": {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) {
          messages.push({ field: spec.field, level: "WARNING", message: `Email "${text}" looks invalid — skipped` });
        } else {
          parsed[spec.field] = text.toLowerCase();
        }
        break;
      }
      case "roles": {
        // "Teacher / Admin", "TEACHER, LIBRARIAN" — whatever separator a school
        // uses. Whether each name is actually an assignable role is not this
        // function's business: staff-core's validateStaffDetails is the one
        // place that rule lives, so it is left for that call to judge.
        const parts = text.split(/[,/;|]+/).map((p) => p.trim().toUpperCase()).filter((p) => p !== "");
        if (parts.length === 0) {
          messages.push({ field: spec.field, level: "WARNING", message: `${spec.label} "${text}" not recognised — skipped` });
        } else {
          parsed[spec.field] = parts;
        }
        break;
      }
      default:
        parsed[spec.field] = text;
    }
  }

  return { parsed, messages };
}

/**
 * Validate one student row. Errors block that row; warnings let it through but
 * are shown to the principal. Nothing is ever silently coerced.
 */
export function validateRow(params: {
  rowNumber: number;
  raw: Record<string, unknown>;
  columnMap: Record<string, string | null>;
  specs?: FieldSpec[];
  seenAdmissionNumbers?: Set<string>;
  /** Injectable so the plausibility checks below are testable. */
  today?: Date;
}): ValidatedRow {
  const specs = params.specs ?? STUDENT_FIELDS;
  const cell = cellReader(params.raw, params.columnMap);

  // Joined before the parse so it is available when `name`'s required check runs.
  const composedName = [cell("firstName"), cell("middleName"), cell("lastName")]
    .filter((x) => x !== "")
    .join(" ");
  const cellWithComposedName = (field: string) =>
    field === "name" && cell(field) === "" ? composedName : cell(field);

  const { parsed, messages } = parseFieldSpecs(specs, cellWithComposedName);

  /*
   * Class and section, after the loop because they interact.
   *
   * A school's Class column carries the section inside it far more often than
   * not — "V-B", "10A", "IX C" — and before this ran, each of those became its
   * own CLASS. A school with 10A/10B/10C ended up with three classes of one
   * section each, which breaks the timetable, the report cards and every
   * per-class count, across every child in the file.
   *
   * A section named in its OWN column always wins: the file's author was
   * explicit there, and a section split out of the class cell is an inference.
   */
  if (typeof parsed.className === "string") {
    const cls = parseClassAndSection(parsed.className);
    if (cls.className) {
      parsed.className = cls.className;
      if (cls.sectionName && !parsed.sectionName) parsed.sectionName = cls.sectionName;
    } else {
      // Not a class at all. Drop it rather than create a class named after a
      // stray cell, and say which value was refused.
      delete parsed.className;
      messages.push({ field: "className", level: "WARNING", message: `Class "${cls.ignored}" is not a class we recognise — child imported without a class` });
    }
    if (cls.ignored && cls.className) {
      messages.push({ field: "className", level: "WARNING", message: `Ignored "${cls.ignored}" in the class — a stream is not a section, so set it yourself if it matters` });
    }
  }
  if (typeof parsed.sectionName === "string") {
    parsed.sectionName = tidySectionName(parsed.sectionName);
  }

  /*
   * Is this date of birth possible for a schoolchild?
   *
   * Found by writing the messy-file fixture: Excel serial 45000 parses cleanly
   * to March 2023, and the importer accepted it for a Class 10 student without
   * a word. A three-year-old in Class 10 is not a date-format problem, it is a
   * wrong column or a wrong serial epoch, and it will surface later as an
   * age-ineligible child on a board form.
   *
   * A WARNING and not an ERROR: the school knows its own children and the date
   * might genuinely be odd, so this is a question rather than a refusal.
   */
  const today = params.today ?? new Date();
  if (parsed.dob instanceof Date) {
    const years = (today.getTime() - parsed.dob.getTime()) / (365.25 * 86_400_000);
    const shown = parsed.dob.toISOString().slice(0, 10);

    // The class is what makes this check sharp. A three-year-old is perfectly
    // normal in Nursery and impossible in Class 10, so a bare age range cannot
    // catch the wrong-column case that a class comparison catches immediately.
    // classOrderFor already ranks Nursery=0 … Class 10=12, and a child is about
    // three years older than that rank.
    const expected =
      typeof parsed.className === "string" ? classOrderFor(parsed.className) + 3 : null;

    // ±4 years, which is wide on purpose: repeaters, late admissions and
    // early starters are all ordinary, and a warning nobody believes is worse
    // than no warning.
    if (expected !== null && expected < 60 && Math.abs(years - expected) > 4) {
      messages.push({
        field: "dob",
        level: "WARNING",
        message: `Date of birth ${shown} makes this child ${years.toFixed(0)} in ${parsed.className} — expected about ${expected}. Check the column and the date format`,
      });
    } else if (expected === null && (years < 2 || years > 25)) {
      // No class to compare against, so fall back to "could this be a
      // schoolchild at all".
      messages.push({
        field: "dob",
        level: "WARNING",
        message: `Date of birth ${shown} makes this child ${years.toFixed(0)} — check the column and the date format`,
      });
    }
  }
  if (parsed.admissionDate instanceof Date && parsed.admissionDate.getTime() > today.getTime()) {
    messages.push({
      field: "admissionDate",
      level: "WARNING",
      message: `Admission date ${parsed.admissionDate.toISOString().slice(0, 10)} is in the future`,
    });
  }

  /*
   * APAAR is 12 digits. Getting this wrong blocks the school's own UDISE+
   * certification rather than just looking untidy, so a malformed one is worth
   * saying out loud at import time instead of at the September deadline.
   */
  if (typeof parsed.apaarId === "string") {
    const digits = parsed.apaarId.replace(/\D/g, "");
    if (digits.length !== 12) {
      messages.push({ field: "apaarId", level: "WARNING", message: `APAAR ID "${parsed.apaarId}" is not 12 digits — it will not pass UDISE+` });
    } else {
      parsed.apaarId = digits;
    }
  }

  // Duplicate admission numbers inside the same file are a real and common mess.
  const adm = parsed.admissionNumber as string | undefined;
  if (adm && params.seenAdmissionNumbers) {
    if (params.seenAdmissionNumbers.has(adm)) {
      messages.push({ field: "admissionNumber", level: "ERROR", message: `Admission No ${adm} appears more than once in this file` });
    } else {
      params.seenAdmissionNumbers.add(adm);
    }
  }

  return { rowNumber: params.rowNumber, raw: params.raw, parsed, state: rowState(messages), messages };
}

/**
 * Validate one row of a staff import. The per-field coercion is generic
 * (parseFieldSpecs); the business rules — is this name long enough, is this
 * role assignable, is this person old enough to work — are staff-core's, the
 * exact same ones createStaff enforces, so an import can never approve a row
 * the manual "Add staff" form would have rejected.
 */
export function validateStaffRow(params: {
  rowNumber: number;
  raw: Record<string, unknown>;
  columnMap: Record<string, string | null>;
  seenEmails?: Set<string>;
  today?: Date;
}): ValidatedRow {
  const cell = cellReader(params.raw, params.columnMap);
  const { parsed, messages } = parseFieldSpecs(STAFF_FIELDS, cell);

  const check = validateStaffDetails(
    {
      name: typeof parsed.name === "string" ? parsed.name : null,
      email: typeof parsed.email === "string" ? parsed.email : null,
      phone: typeof parsed.phone === "string" ? parsed.phone : null,
      roles: Array.isArray(parsed.roles) ? (parsed.roles as string[]) : null,
      basicPaise: typeof parsed.basicPay === "number" ? parsed.basicPay : null,
      joiningIso: parsed.joiningDate instanceof Date ? parsed.joiningDate.toISOString().slice(0, 10) : null,
      dobIso: parsed.dob instanceof Date ? parsed.dob.toISOString().slice(0, 10) : null,
    },
    params.today,
  );
  messages.push(...check.messages);

  // Duplicate emails inside the same file are the staff equivalent of a
  // repeated admission number — two rows fighting to create the same login.
  const email = typeof parsed.email === "string" ? parsed.email : undefined;
  if (email && params.seenEmails) {
    if (params.seenEmails.has(email)) {
      messages.push({ field: "email", level: "ERROR", message: `${email} appears more than once in this file` });
    } else {
      params.seenEmails.add(email);
    }
  }

  return { rowNumber: params.rowNumber, raw: params.raw, parsed, state: rowState(messages), messages };
}

/**
 * Validate one row of a fee-structure import: one class charging one head one
 * amount. Unlike students, a class and a fee head are not invented on the
 * way in — both must already exist, the same requirement setClassFees makes
 * of whoever fills in the structure grid by hand.
 */
export function validateFeeStructureRow(params: {
  rowNumber: number;
  raw: Record<string, unknown>;
  columnMap: Record<string, string | null>;
  classByName: Map<string, { id: string; name: string }>;
  feeHeadByName: Map<string, { id: string; name: string }>;
}): ValidatedRow {
  const cell = cellReader(params.raw, params.columnMap);
  const rawAmountText = cell("amount");
  const { parsed, messages } = parseFieldSpecs(FEE_STRUCTURE_FIELDS, cell);

  if (typeof parsed.className === "string") {
    const tidied = tidyClassName(parsed.className);
    const cls = params.classByName.get(normaliseHeader(tidied));
    if (cls) {
      parsed.className = cls.name;
      parsed.classId = cls.id;
    } else {
      messages.push({
        field: "className",
        level: "ERROR",
        message: `Class "${parsed.className}" was not found — add it under Setup first`,
      });
    }
  }

  if (typeof parsed.feeHeadName === "string") {
    const head = params.feeHeadByName.get(normaliseHeader(parsed.feeHeadName));
    if (head) {
      parsed.feeHeadName = head.name;
      parsed.feeHeadId = head.id;
    } else {
      messages.push({
        field: "feeHeadName",
        level: "ERROR",
        message: `Fee head "${parsed.feeHeadName}" was not found — add it from Fees → Structures first`,
      });
    }
  }

  // A fee row with no usable amount cannot be written at all, so an amount
  // that failed to parse is an error here rather than the generic "skipped"
  // warning — there is no such thing as importing a row with no amount.
  if (parsed.amount === undefined && rawAmountText !== "") {
    const i = messages.findIndex((m) => m.field === "amount");
    if (i !== -1) messages[i] = { ...messages[i], level: "ERROR" };
  } else if (typeof parsed.amount === "number") {
    // The same absurdity guard setClassFees applies, checked here so a figure
    // that would be refused at apply is instead refused at review.
    const check = validateFeeAmount(parsed.amount);
    if (!check.allowed) {
      messages.push({ field: "amount", level: "ERROR", message: check.reason! });
      delete parsed.amount;
    }
  }

  return { rowNumber: params.rowNumber, raw: params.raw, parsed, state: rowState(messages), messages };
}

/** Indian school files are dd/mm/yyyy far more often than ISO. Excel serials happen too. */
export function parseIndianDate(text: string): Date | null {
  const t = text.trim();
  if (t === "") return null;

  // Excel serial date (days since 1899-12-30)
  if (/^\d{5}$/.test(t)) {
    const serial = Number(t);
    if (serial > 20000 && serial < 60000) {
      return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    }
  }

  const dmy = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    let year = Number(y);
    if (year < 100) year += year > 30 ? 1900 : 2000;
    const day = Number(d);
    const month = Number(m);
    // Ambiguous only if both <= 12; Indian convention says day first.
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.getUTCDate() === day ? date : null;
    }
    return null;
  }

  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

export function parseGender(text: string): "MALE" | "FEMALE" | "OTHER" | null {
  const t = text.trim().toLowerCase();
  if (["m", "male", "boy", "b"].includes(t)) return "MALE";
  if (["f", "female", "girl", "g"].includes(t)) return "FEMALE";
  if (["o", "other", "transgender"].includes(t)) return "OTHER";
  return null;
}

export type BatchSummary = {
  totalRows: number;
  okRows: number;
  warningRows: number;
  errorRows: number;
  /** rows that will actually be written if the principal approves */
  applicableRows: number;
};

export function summariseBatch(rows: ValidatedRow[]): BatchSummary {
  const ok = rows.filter((r) => r.state === "OK").length;
  const warn = rows.filter((r) => r.state === "WARNING").length;
  const err = rows.filter((r) => r.state === "ERROR").length;
  return {
    totalRows: rows.length,
    okRows: ok,
    warningRows: warn,
    errorRows: err,
    applicableRows: ok + warn,
  };
}

/**
 * Which of the classes and sections an import created may now be removed.
 *
 * Extracted from the undo action because it is a rule, not plumbing, and this
 * repo keeps rules in a tested core. The rule has two halves and the order
 * matters:
 *
 *  - A SECTION goes only if no child is in it.
 *  - A CLASS goes only if no child is in it AND every section under it is also
 *    going. A class whose 5-B still holds a hand-added child keeps 5-B, and
 *    therefore keeps itself.
 *
 * Anything the school already had is never a candidate: only ids the batch
 * recorded creating are considered, so an import that placed children into an
 * existing Class 5 can never take Class 5 away.
 */
export function removableAfterUndo(params: {
  createdClassIds: string[];
  createdSectionIds: string[];
  /** Students remaining, by section id. Absent means none. */
  studentsBySectionId: Record<string, number>;
  /** Students remaining, by class id. Absent means none. */
  studentsByClassId: Record<string, number>;
  /** Every section currently under a class, created by this batch or not. */
  sectionIdsByClassId: Record<string, string[]>;
}): { classIds: string[]; sectionIds: string[] } {
  const created = new Set(params.createdSectionIds);

  const sectionIds = params.createdSectionIds.filter(
    (id) => (params.studentsBySectionId[id] ?? 0) === 0,
  );
  const going = new Set(sectionIds);

  const classIds = params.createdClassIds.filter((classId) => {
    if ((params.studentsByClassId[classId] ?? 0) > 0) return false;
    const sections = params.sectionIdsByClassId[classId] ?? [];
    // A section the school added itself is enough to keep the class, which is
    // why membership of `created` is checked and not just `going`.
    return sections.every((sectionId) => created.has(sectionId) && going.has(sectionId));
  });

  return { classIds, sectionIds };
}
