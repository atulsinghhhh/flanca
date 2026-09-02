import { describe, expect, it } from "vitest";
import {
  canDeleteTerm,
  canDeleteYear,
  suggestTerms,
  tidyYearName,
  validateTermLabel,
  validateYearDates,
  validateYearName,
} from "../year-core";

describe("tidyYearName — every way a school writes its year", () => {
  it("collapses the long form", () => {
    expect(tidyYearName("2026-2027")).toBe("2026-27");
    expect(tidyYearName("2026/2027")).toBe("2026-27");
  });

  it("expands the short form", () => {
    expect(tidyYearName("26-27")).toBe("2026-27");
  });

  it("reads a single year as the one starting then, because an Indian school year spans two", () => {
    expect(tidyYearName("2026")).toBe("2026-27");
    expect(tidyYearName("2099")).toBe("2099-00");
  });

  it("leaves the canonical form alone", () => {
    expect(tidyYearName("2026-27")).toBe("2026-27");
    expect(tidyYearName(" 2026-27 ")).toBe("2026-27");
  });
});

describe("validateYearName", () => {
  it("refuses a duplicate however it was typed", () => {
    expect(validateYearName("2026-2027", ["2026-27"]).allowed).toBe(false);
  });

  it("accepts a new year", () => {
    expect(validateYearName("2027-28", ["2026-27"]).allowed).toBe(true);
  });

  it("refuses nothing at all", () => {
    expect(validateYearName("  ").allowed).toBe(false);
  });
});

describe("validateYearDates", () => {
  it("accepts an Indian school year", () => {
    expect(validateYearDates("2026-04-01", "2027-03-31").allowed).toBe(true);
  });

  it("refuses a year that ends before it starts", () => {
    expect(validateYearDates("2027-03-31", "2026-04-01").reason).toMatch(/ends before it starts/);
  });

  it("refuses a term mistaken for a year", () => {
    expect(validateYearDates("2026-04-01", "2026-06-30").reason).toMatch(/five months/);
  });

  it("refuses three years", () => {
    expect(validateYearDates("2026-04-01", "2029-03-31").reason).toMatch(/eighteen months/);
  });

  it("refuses something that is not a date", () => {
    expect(validateYearDates("not-a-date", "2027-03-31").allowed).toBe(false);
  });
});

describe("canDeleteYear — history stays, configuration goes with the year", () => {
  const clean = { invoices: 0, structures: 0, examTerms: 0, enrollments: 0, isCurrent: false };

  it("allows an empty year nobody is in", () => {
    const check = canDeleteYear(clean);
    expect(check.allowed).toBe(true);
    expect(check.alsoGoes).toBeNull();
  });

  it("refuses the current year, and says what to do instead", () => {
    expect(canDeleteYear({ ...clean, isCurrent: true }).reason).toMatch(/make another year current/i);
  });

  it("refuses a year that has billed anybody, in numbers", () => {
    expect(canDeleteYear({ ...clean, invoices: 1 }).reason).toMatch(/1 invoice was/);
    expect(canDeleteYear({ ...clean, invoices: 847 }).reason).toMatch(/847 invoices were/);
  });

  it("refuses a year children were enrolled in", () => {
    expect(canDeleteYear({ ...clean, enrollments: 40 }).reason).toMatch(/40 children were/);
  });

  it("allows a year whose only contents are things somebody typed, and names them", () => {
    // Refusing here is what made a year created by mistake undeletable: nothing in
    // the product removes a fee structure, so the year could never become empty.
    const check = canDeleteYear({ ...clean, structures: 1, examTerms: 2 });
    expect(check.allowed).toBe(true);
    expect(check.alsoGoes).toBe(
      "This also removes the fee structure for 1 class and 2 exam terms. Nothing was billed from any of it.",
    );
  });

  it("pluralises what goes", () => {
    expect(canDeleteYear({ ...clean, structures: 13 }).alsoGoes).toMatch(/13 classes/);
    expect(canDeleteYear({ ...clean, examTerms: 1 }).alsoGoes).toMatch(/1 exam term\./);
  });
});

describe("canDeleteTerm", () => {
  it("allows a term nothing was billed for", () => {
    expect(canDeleteTerm({ invoices: 0 }).allowed).toBe(true);
  });

  it("refuses once a parent has an invoice naming it", () => {
    expect(canDeleteTerm({ invoices: 849 }).reason).toMatch(/849 invoices have/);
  });
});

describe("validateTermLabel", () => {
  it("refuses an empty or duplicate label", () => {
    expect(validateTermLabel("").allowed).toBe(false);
    expect(validateTermLabel("term 1", ["Term 1"]).allowed).toBe(false);
    expect(validateTermLabel("Term 3", ["Term 1"]).allowed).toBe(true);
  });
});

describe("suggestTerms — so a school picks a number instead of typing twelve fields", () => {
  it("splits an April-to-March year into four quarters, named by the months they cover", () => {
    const terms = suggestTerms("2026-04-01", "2027-03-31", 4);
    expect(terms.map((t) => t.label)).toEqual([
      "Term 1 (Apr–Jun)",
      "Term 2 (Jul–Sep)",
      "Term 3 (Oct–Dec)",
      "Term 4 (Jan–Mar)",
    ]);
  });

  it("matches the labels the seeded school already uses, so nothing renames itself", () => {
    expect(suggestTerms("2026-04-01", "2027-03-31", 4)[0].label).toBe("Term 1 (Apr–Jun)");
  });

  it("falls due on the 15th of the term's first month — fees are collected at the start", () => {
    const terms = suggestTerms("2026-04-01", "2027-03-31", 4);
    expect(terms.map((t) => t.dueDate)).toEqual(["2026-04-15", "2026-07-15", "2026-10-15", "2027-01-15"]);
  });

  it("crosses the calendar year correctly", () => {
    const terms = suggestTerms("2026-04-01", "2027-03-31", 4);
    expect(terms[3].dueDate.startsWith("2027")).toBe(true);
  });

  it("calls two terms halves, because that is what a school calls them", () => {
    expect(suggestTerms("2026-04-01", "2027-03-31", 2).map((t) => t.label)).toEqual([
      "First Half (Apr–Sep)",
      "Second Half (Oct–Mar)",
    ]);
  });

  it("handles monthly collection", () => {
    const terms = suggestTerms("2026-04-01", "2027-03-31", 12);
    expect(terms).toHaveLength(12);
    expect(terms[0].label).toBe("Month (Apr)");
    expect(terms[11].dueDate).toBe("2027-03-15");
  });

  it("gives the longer terms first when the months do not divide evenly", () => {
    const terms = suggestTerms("2026-04-01", "2027-03-31", 5);
    expect(terms).toHaveLength(5);
    expect(terms[0].label).toBe("Term 1 (Apr–Jun)");   // 3 months
    expect(terms[4].label).toBe("Term 5 (Feb–Mar)");   // 2 months
  });

  it("refuses to guess from nonsense rather than returning something wrong", () => {
    expect(suggestTerms("nope", "2027-03-31", 4)).toEqual([]);
    expect(suggestTerms("2026-04-01", "2027-03-31", 0)).toEqual([]);
    expect(suggestTerms("2026-04-01", "2027-03-31", 99)).toEqual([]);
  });
});
