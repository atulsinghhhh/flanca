import { describe, expect, it } from "vitest";
import {
  mapColumns,
  parseGender,
  parseIndianDate,
  removableAfterUndo,
  summariseBatch,
  validateRow,
  type ValidatedRow,
} from "../import-core";

describe("mapColumns — a clerk should confirm, not configure", () => {
  it("matches the header spellings real school files use", () => {
    const map = mapColumns([
      "Adm.No", "Name of Student", "Std", "Sec", "Roll", "Sex",
      "DOB (DD/MM/YYYY)", "Father's Name", "Mobile No",
    ]);
    expect(map.admissionNumber).toBe("Adm.No");
    expect(map.name).toBe("Name of Student");
    expect(map.className).toBe("Std");
    expect(map.sectionName).toBe("Sec");
    expect(map.rollNumber).toBe("Roll");
    expect(map.gender).toBe("Sex");
    expect(map.dob).toBe("DOB (DD/MM/YYYY)");
    expect(map.fatherName).toBe("Father's Name");
    expect(map.guardianPhone).toBe("Mobile No");
  });

  it("leaves unmatched fields null instead of guessing", () => {
    const map = mapColumns(["Admission No", "Name"]);
    expect(map.bloodGroup).toBeNull();
    expect(map.apaarId).toBeNull();
  });

  it("never maps two fields to the same column", () => {
    const map = mapColumns(["Name"]);
    const used = Object.values(map).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });
});

describe("parseIndianDate", () => {
  it("reads dd/mm/yyyy the way an Indian school writes it", () => {
    expect(parseIndianDate("07/03/2015")!.toISOString().slice(0, 10)).toBe("2015-03-07");
    expect(parseIndianDate("7-3-2015")!.toISOString().slice(0, 10)).toBe("2015-03-07");
    expect(parseIndianDate("07.03.15")!.toISOString().slice(0, 10)).toBe("2015-03-07");
  });

  it("reads ISO and Excel serials", () => {
    expect(parseIndianDate("2015-03-07")!.toISOString().slice(0, 10)).toBe("2015-03-07");
    expect(parseIndianDate("42000")!.toISOString().slice(0, 10)).toBe("2014-12-27");
  });

  it("rejects impossible dates rather than inventing one", () => {
    expect(parseIndianDate("32/01/2015")).toBeNull();
    expect(parseIndianDate("07/13/2015")).toBeNull();
    expect(parseIndianDate("hello")).toBeNull();
    expect(parseIndianDate("")).toBeNull();
  });
});

describe("parseGender", () => {
  it("accepts the short forms clerks type", () => {
    expect(parseGender("M")).toBe("MALE");
    expect(parseGender("female")).toBe("FEMALE");
    expect(parseGender("Boy")).toBe("MALE");
    expect(parseGender("g")).toBe("FEMALE");
    expect(parseGender("?")).toBeNull();
  });
});

describe("validateRow — errors block, warnings inform, nothing is silently coerced", () => {
  const columnMap = mapColumns(["Adm No", "Name", "Class", "Mobile", "DOB", "Email"]);

  it("accepts a clean row", () => {
    const r = validateRow({
      rowNumber: 2,
      raw: { "Adm No": "1001", Name: "Aarav Sharma", Class: "5", Mobile: "9876543210", DOB: "07/03/2015" },
      columnMap,
    });
    expect(r.state).toBe("OK");
    expect(r.parsed.admissionNumber).toBe("1001");
    expect(r.parsed.guardianPhone).toBe("9876543210");
    expect((r.parsed.dob as Date).toISOString().slice(0, 10)).toBe("2015-03-07");
  });

  it("errors when a required field is empty", () => {
    const r = validateRow({ rowNumber: 3, raw: { "Adm No": "", Name: "" }, columnMap });
    expect(r.state).toBe("ERROR");
    expect(r.messages.filter((m) => m.level === "ERROR")).toHaveLength(2);
  });

  it("warns but keeps the row when a mobile is malformed", () => {
    const r = validateRow({
      rowNumber: 4,
      raw: { "Adm No": "1002", Name: "Isha", Mobile: "98765" },
      columnMap,
    });
    expect(r.state).toBe("WARNING");
    expect(r.messages[0].message).toMatch(/not a 10-digit Indian mobile/);
    expect(r.parsed.name).toBe("Isha");
  });

  it("strips a +91 country code", () => {
    const r = validateRow({
      rowNumber: 5,
      raw: { "Adm No": "1003", Name: "Vivaan", Mobile: "+91 98765 43210" },
      columnMap,
    });
    expect(r.parsed.guardianPhone).toBe("9876543210");
    expect(r.state).toBe("OK");
  });

  it("catches duplicate admission numbers inside one file", () => {
    const seen = new Set<string>();
    const a = validateRow({ rowNumber: 2, raw: { "Adm No": "1001", Name: "A" }, columnMap, seenAdmissionNumbers: seen });
    const b = validateRow({ rowNumber: 3, raw: { "Adm No": "1001", Name: "B" }, columnMap, seenAdmissionNumbers: seen });
    expect(a.state).toBe("OK");
    expect(b.state).toBe("ERROR");
    expect(b.messages[0].message).toMatch(/more than once/);
  });

  it("warns on an invalid email and drops it rather than storing rubbish", () => {
    const r = validateRow({
      rowNumber: 6,
      raw: { "Adm No": "1004", Name: "Diya", Email: "not-an-email" },
      columnMap,
    });
    expect(r.state).toBe("WARNING");
    expect(r.parsed.guardianEmail).toBeUndefined();
  });
});

describe("summariseBatch — what the principal approves", () => {
  it("counts what will be written", () => {
    const rows = [
      { state: "OK" }, { state: "OK" }, { state: "WARNING" }, { state: "ERROR" },
    ] as ValidatedRow[];
    const s = summariseBatch(rows);
    expect(s.totalRows).toBe(4);
    expect(s.okRows).toBe(2);
    expect(s.warningRows).toBe(1);
    expect(s.errorRows).toBe(1);
    expect(s.applicableRows).toBe(3);
  });
});

/*
 * One real school's file, as a fixture.
 *
 * Every mess in here is one that was found by writing out what a school
 * actually sends rather than what a template asks for: the name split across
 * two columns, the section living inside the Class cell in three different
 * notations, a non-breaking space from a copy-paste, an Excel date that came
 * across as a serial number, two mobiles in one cell, and a duplicate
 * admission number left behind by whoever kept the previous register.
 *
 * The point of it being a fixture is that the file does not change when the
 * code does. If a future edit re-breaks "10A", this fails.
 */
const MESSY_HEADERS = [
  "Sr No", "STUDENT FIRST NAME", "SURNAME", "Std", "Sec",
  "DOB (DD/MM/YYYY)", "Father's Name", "Mobile No", "Email ID",
  "Category", "APAAR", "Roll",
];

type MessyRow = Record<string, string>;
const messyRow = (values: string[]): MessyRow =>
  Object.fromEntries(MESSY_HEADERS.map((h, i) => [h, values[i] ?? ""]));

describe("a real school's spreadsheet, end to end", () => {
  const columnMap = mapColumns(MESSY_HEADERS);

  it("maps a file whose name is split across two columns", () => {
    // The killer: there is no "Name" column at all. Before name parts existed,
    // every row in this file was a hard error and the clerk concluded we could
    // not read their data.
    expect(columnMap.name).toBeNull();
    expect(columnMap.firstName).toBe("STUDENT FIRST NAME");
    expect(columnMap.lastName).toBe("SURNAME");
    expect(columnMap.className).toBe("Std");
    expect(columnMap.sectionName).toBe("Sec");
    expect(columnMap.apaarId).toBe("APAAR");
  });

  // Pinned, because an age-against-class check read from the live clock is a
  // test whose meaning drifts every year.
  const TODAY = new Date("2026-08-20T00:00:00Z");

  const run = (values: string[], seen?: Set<string>) =>
    validateRow({ rowNumber: 2, raw: messyRow(values), columnMap, seenAdmissionNumbers: seen, today: TODAY });

  it("Roman class with its own section column, and a spaced +91 mobile", () => {
    const r = run(["1001", "RAHUL", "SHARMA", "V", "B", "05/06/2016",
      "SURESH SHARMA", "+91 98765 43210", "suresh@example.com", "GEN", "123456789012", "1"]);
    expect(r.parsed.name).toBe("RAHUL SHARMA");
    expect(r.parsed.className).toBe("Class 5");
    expect(r.parsed.sectionName).toBe("B");
    expect(r.parsed.guardianPhone).toBe("9876543210");
    expect(r.parsed.apaarId).toBe("123456789012");
    expect(r.parsed.rollNumber).toBe(1);
    expect(r.state).toBe("OK");
  });

  it("section glued to the class, an Excel serial date, two mobiles, a bad email, a short APAAR", () => {
    const r = run(["1002", "Isha", "Patel", "10A", "", "45000",
      "Mahesh Patel", "9876543210 / 9812345678", "not-an-email", "OBC", "1234", "2"]);
    // "10A" is Class 10 section A — NOT a class called "10A". A school with
    // 10A/10B/10C used to get three classes of one section each.
    expect(r.parsed.className).toBe("Class 10");
    expect(r.parsed.sectionName).toBe("A");
    // The serial parses, and is then challenged: a child born in 2023 cannot be
    // in Class 10, which is a wrong column or a wrong epoch rather than a
    // formatting problem.
    expect((r.parsed.dob as Date).toISOString().slice(0, 10)).toBe("2023-03-15");
    expect(r.messages.some((m) => /in Class 10 — expected about 15/.test(m.message))).toBe(true);
    expect(r.parsed.guardianPhone).toBe("9876543210");
    expect(r.messages.some((m) => /more than one number/.test(m.message))).toBe(true);
    expect(r.parsed.guardianEmail).toBeUndefined();
    expect(r.messages.some((m) => /not 12 digits/.test(m.message))).toBe(true);
    expect(r.state).toBe("WARNING");
  });

  it("Roman class with the section inside it, and a single-digit-month date", () => {
    const r = run(["1003", "Aarav", "Kumar", "IX C", "", "12-3-11", "", "98765", "", "SC", "", ""]);
    expect(r.parsed.className).toBe("Class 9");
    expect(r.parsed.sectionName).toBe("C");
    expect((r.parsed.dob as Date).toISOString().slice(0, 10)).toBe("2011-03-12");
    // The mobile is kept even though it is wrong, so the clerk can see and fix
    // it rather than have it vanish.
    expect(r.parsed.guardianPhone).toBe("98765");
    expect(r.messages.some((m) => /not a 10-digit Indian mobile/.test(m.message))).toBe(true);
  });

  it("a non-breaking space in the name, and a stream that is not a section", () => {
    const r = run(["1004", "Fatima ", "Sheikh", "XII Science", "A", "2009-07-14",
      "", "", "", "", "", ""]);
    // The NBSP is invisible in Excel and would otherwise print as "Fatima  Sheikh"
    // on a report card, or fail a name match.
    expect(r.parsed.name).toBe("Fatima Sheikh");
    expect(r.parsed.className).toBe("Class 12");
    // The section column was explicit, so it wins over anything inferred.
    expect(r.parsed.sectionName).toBe("A");
    expect(r.messages.some((m) => /a stream is not a section/.test(m.message))).toBe(true);
  });

  it("pre-primary classes survive", () => {
    const r = run(["1005", "Vivaan", "Rao", "Nursery", "", "", "", "", "", "", "", ""]);
    expect(r.parsed.className).toBe("Nursery");
    expect(r.state).toBe("OK");
  });

  it("a blank admission number is refused, because nothing can identify the child", () => {
    const r = run(["", "Ananya", "Iyer", "5", "A", "", "", "", "", "", "", ""]);
    expect(r.state).toBe("ERROR");
    expect(r.messages.some((m) => m.level === "ERROR" && /Admission No is required/.test(m.message))).toBe(true);
  });

  it("a duplicate admission number left over from the old register is refused", () => {
    const seen = new Set<string>();
    run(["1001", "Rahul", "Sharma", "V", "B", "", "", "", "", "", "", ""], seen);
    const again = run(["1001", "Rahul", "Sharma", "V", "B", "", "", "", "", "", "", ""], seen);
    expect(again.state).toBe("ERROR");
  });

  it("a cell that is not a class does not become a class", () => {
    const r = run(["1008", "Zoya", "Khan", "A", "", "", "", "", "", "", "", ""]);
    expect(r.parsed.className).toBeUndefined();
    expect(r.messages.some((m) => /not a class we recognise/.test(m.message))).toBe(true);
    // Still imported. A child without a class is a fixable problem; a child
    // refused at the door is a school that stops trusting the import.
    expect(r.state).toBe("WARNING");
  });

  it("the whole file summarises to what the principal will approve", () => {
    const seen = new Set<string>();
    const rows = [
      ["1001", "RAHUL", "SHARMA", "V", "B", "05/06/2016", "S", "+91 98765 43210", "s@e.com", "GEN", "123456789012", "1"],
      ["1002", "Isha", "Patel", "10A", "", "45000", "M", "9876543210 / 9812345678", "bad", "OBC", "1234", "2"],
      ["1003", "Aarav", "Kumar", "IX C", "", "12-3-11", "", "98765", "", "SC", "", ""],
      ["", "Ananya", "Iyer", "5", "A", "", "", "", "", "", "", ""],
      ["1001", "Rahul", "Sharma", "V", "B", "", "", "", "", "", "", ""],
    ].map((v, i) => validateRow({ rowNumber: i + 2, raw: messyRow(v), columnMap, seenAdmissionNumbers: seen, today: TODAY }));

    const s = summariseBatch(rows);
    expect(s.totalRows).toBe(5);
    expect(s.errorRows).toBe(2); // the blank and the duplicate
    expect(s.applicableRows).toBe(3);

    // Three distinct classes, not five, and no class named after a section.
    const classes = new Set(rows.map((r) => r.parsed.className).filter(Boolean));
    expect([...classes].sort()).toEqual(["Class 10", "Class 5", "Class 9"]);
  });
});

describe("removableAfterUndo — putting the school back exactly as it was", () => {
  const base = {
    createdClassIds: ["c5"],
    createdSectionIds: ["c5a", "c5b"],
    studentsBySectionId: {},
    studentsByClassId: {},
    sectionIdsByClassId: { c5: ["c5a", "c5b"] },
  };

  it("removes a class and its sections when the import's children are gone", () => {
    const r = removableAfterUndo(base);
    expect(r.sectionIds.sort()).toEqual(["c5a", "c5b"]);
    expect(r.classIds).toEqual(["c5"]);
  });

  it("keeps a section that still holds a child, and therefore keeps its class", () => {
    const r = removableAfterUndo({ ...base, studentsBySectionId: { c5b: 1 } });
    expect(r.sectionIds).toEqual(["c5a"]);
    // 5-B survives, so Class 5 has to survive with it.
    expect(r.classIds).toEqual([]);
  });

  it("keeps a class the school added its own section to", () => {
    const r = removableAfterUndo({ ...base, sectionIdsByClassId: { c5: ["c5a", "c5b", "c5c-added-by-hand"] } });
    expect(r.sectionIds.sort()).toEqual(["c5a", "c5b"]);
    expect(r.classIds).toEqual([]);
  });

  it("never touches a class the school already had", () => {
    // The import placed children into an existing Class 9 and created nothing,
    // so undo has nothing to tidy — Class 9 is not its to remove.
    const r = removableAfterUndo({
      createdClassIds: [],
      createdSectionIds: [],
      studentsBySectionId: {},
      studentsByClassId: {},
      sectionIdsByClassId: { c9: ["c9a"] },
    });
    expect(r.classIds).toEqual([]);
    expect(r.sectionIds).toEqual([]);
  });

  it("keeps a class that still holds a child with no section at all", () => {
    // A child imported with a class but no section sits directly on the class.
    const r = removableAfterUndo({ ...base, studentsByClassId: { c5: 1 } });
    expect(r.classIds).toEqual([]);
  });
});
