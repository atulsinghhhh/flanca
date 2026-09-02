import { describe, expect, it } from "vitest";
import { certificateMeta, dateInWords } from "../certificate-core";

describe("dateInWords — a mandatory TC field, precisely so a figure cannot be altered", () => {
  it("writes ordinals and Indian-style years", () => {
    expect(dateInWords(new Date(Date.UTC(2015, 2, 7)))).toBe("Seventh March Two Thousand Fifteen");
    expect(dateInWords(new Date(Date.UTC(2011, 0, 1)))).toBe("First January Two Thousand Eleven");
    expect(dateInWords(new Date(Date.UTC(2009, 11, 31)))).toBe("Thirty-First December Two Thousand Nine");
  });

  it("handles the awkward ordinals", () => {
    expect(dateInWords(new Date(Date.UTC(2020, 5, 2)))).toBe("Second June Two Thousand Twenty");
    expect(dateInWords(new Date(Date.UTC(2020, 5, 12)))).toBe("Twelfth June Two Thousand Twenty");
    expect(dateInWords(new Date(Date.UTC(2020, 5, 20)))).toBe("Twentieth June Two Thousand Twenty");
    expect(dateInWords(new Date(Date.UTC(2020, 5, 23)))).toBe("Twenty-Third June Two Thousand Twenty");
  });

  it("writes a year with hundreds", () => {
    expect(dateInWords(new Date(Date.UTC(1998, 7, 15)))).toBe("Fifteenth August One Thousand Nine Hundred Ninety Eight");
  });
});

describe("certificateMeta", () => {
  it("finds a type and falls back rather than crashing a print", () => {
    expect(certificateMeta("TRANSFER").short).toBe("TC");
    expect(certificateMeta("BONAFIDE").prefix).toBe("BC/");
    expect(certificateMeta("NONSENSE").value).toBe("TRANSFER");
  });

  it("gives every type its own gap-free sequence", () => {
    const kinds = new Set(["TRANSFER", "BONAFIDE", "CHARACTER", "STUDY", "CONDUCT", "FEE_PAID"].map((t) => certificateMeta(t).sequenceKind));
    expect(kinds.size).toBe(6);
  });
});
