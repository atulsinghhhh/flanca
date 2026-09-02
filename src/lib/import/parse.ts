import * as XLSX from "xlsx";

export type ParsedSheet = {
  sheetName: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
};

/**
 * Read the first non-empty sheet of a school's Excel/CSV file.
 *
 * Real school files are messy: merged title rows above the header, blank
 * columns, trailing empty rows. So we find the header row rather than assuming
 * it is row 1, and we never silently drop a column we do not understand.
 */
export function parseWorkbook(buffer: ArrayBuffer): ParsedSheet {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: false });
    if (matrix.length === 0) continue;

    const headerIndex = findHeaderRow(matrix);
    if (headerIndex === -1) continue;

    const rawHeaders = (matrix[headerIndex] ?? []).map((h) => String(h ?? "").trim());
    // Keep positional identity for unnamed columns so nothing is quietly lost.
    const headers = rawHeaders.map((h, i) => (h === "" ? `Column ${i + 1}` : h));

    const rows: Array<Record<string, unknown>> = [];
    for (let r = headerIndex + 1; r < matrix.length; r++) {
      const line = matrix[r] ?? [];
      const isEmpty = line.every((cell) => cell == null || String(cell).trim() === "");
      if (isEmpty) continue;

      const row: Record<string, unknown> = {};
      headers.forEach((header, c) => {
        row[header] = line[c] ?? "";
      });
      rows.push(row);
    }

    if (rows.length > 0) return { sheetName, headers, rows };
  }

  return { sheetName: "", headers: [], rows: [] };
}

/**
 * The header row is the first row with at least two non-empty text cells that
 * does not look like a title banner ("STUDENT LIST 2026-27" spans one cell).
 */
function findHeaderRow(matrix: unknown[][]): number {
  for (let r = 0; r < Math.min(matrix.length, 12); r++) {
    const cells = (matrix[r] ?? []).map((c) => String(c ?? "").trim()).filter((c) => c !== "");
    if (cells.length >= 2) return r;
  }
  return matrix.length > 0 ? 0 : -1;
}

/** The blank template we hand a school that has nothing but a paper register. */
export function buildStudentTemplate(): Buffer {
  const headers = [
    "Admission No", "Student Name", "Class", "Section", "Roll No", "Gender",
    "Date of Birth", "Father's Name", "Mother's Name", "Parent Mobile",
    "Parent Email", "Address", "Category", "Blood Group",
    "APAAR ID", "PEN", "Name as per Aadhaar", "Admission Date",
  ];

  const example = [
    "NPS/1001", "Aarav Sharma", "Class 5", "A", "1", "M",
    "07/03/2015", "Rajesh Sharma", "Sunita Sharma", "9876543210",
    "rajesh.sharma@example.com", "12, Arera Colony, Bhopal", "GEN", "B+",
    "", "", "Aarav Sharma", "01/04/2026",
  ];

  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  sheet["!cols"] = headers.map((h) => ({ wch: Math.max(12, h.length + 4) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Students");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function templateWorkbook(sheetName: string, headers: string[], example: string[]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  sheet["!cols"] = headers.map((h) => ({ wch: Math.max(12, h.length + 4) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** The blank template for a school adding its people. */
export function buildStaffTemplate(): Buffer {
  return templateWorkbook(
    "Staff",
    [
      "Name", "Email", "Mobile", "Employee Id", "Designation", "Department",
      "Qualification", "Roles", "Basic Pay (monthly)", "Joining Date", "Date of Birth",
      "Gender", "Address", "PAN", "Bank Account No", "IFSC",
    ],
    [
      "Priya Menon", "priya.menon@school.edu.in", "9826010001", "", "Senior Teacher", "Science",
      "M.Sc., B.Ed.", "TEACHER", "42000", "01/06/2018", "14/02/1990",
      "FEMALE", "12, Arera Colony, Bhopal", "ABCDE1234F", "123456789012", "HDFC0001234",
    ],
  );
}

/**
 * The blank template for pricing classes: one row per (class, fee head) pair,
 * because which heads a school charges is its own — a fixed set of columns
 * would either miss a head this school has or invent one it does not.
 */
export function buildFeeStructureTemplate(): Buffer {
  return templateWorkbook(
    "Fee structure",
    ["Class", "Fee Head", "Amount (a year, in Rs)"],
    ["Class 5", "Tuition Fee", "36000"],
  );
}
