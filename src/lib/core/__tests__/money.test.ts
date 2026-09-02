import { describe, expect, it } from "vitest";
import { formatMoney, groupIndian, moneyInWords, numberToWords, paise, paiseFromText } from "../money";

describe("Indian digit grouping", () => {
  it("groups in lakhs and crores, not thousands", () => {
    expect(groupIndian(1234567)).toBe("12,34,567");
    expect(groupIndian(100000)).toBe("1,00,000");
    expect(groupIndian(999)).toBe("999");
    expect(groupIndian(1000)).toBe("1,000");
    expect(groupIndian(10000000)).toBe("1,00,00,000");
  });
});

describe("formatMoney", () => {
  it("omits decimals when the amount is whole rupees", () => {
    expect(formatMoney(paise(40500))).toBe("₹40,500");
  });

  it("shows paise when present", () => {
    expect(formatMoney(4050050)).toBe("₹40,500.50");
    expect(formatMoney(105)).toBe("₹1.05");
  });

  it("handles negatives and symbol suppression", () => {
    expect(formatMoney(-paise(500))).toBe("−₹500");
    expect(formatMoney(paise(500), { withSymbol: false })).toBe("500");
  });
});

describe("moneyInWords — cheques and receipts", () => {
  it("writes Indian numbering", () => {
    expect(numberToWords(40500)).toBe("Forty Thousand Five Hundred");
    expect(numberToWords(1234567)).toBe("Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven");
    expect(numberToWords(11)).toBe("Eleven");
  });

  it("suffixes Only, as a receipt must", () => {
    expect(moneyInWords(paise(40500))).toBe("Forty Thousand Five Hundred Rupees Only");
    expect(moneyInWords(0)).toBe("Zero Rupees Only");
  });

  it("includes paise when non-zero", () => {
    expect(moneyInWords(4050050)).toBe("Forty Thousand Five Hundred Rupees and Fifty Paise Only");
  });
});

describe("paiseFromText — what a clerk types at the counter", () => {
  it("accepts the comma the rest of the interface prints", () => {
    // The bug this replaces: Number("13,700") is NaN, so the fee counter read ₹0.
    expect(Number("13,700")).toBeNaN();
    expect(paiseFromText("13,700")).toBe(1370000);
  });

  it("accepts a rupee sign and stray spaces", () => {
    expect(paiseFromText("₹13,700")).toBe(1370000);
    expect(paiseFromText("  13700 ")).toBe(1370000);
  });

  it("keeps paise when they are typed", () => {
    expect(paiseFromText("100.50")).toBe(10050);
    expect(paiseFromText("0.01")).toBe(1);
  });

  it("tells nothing-typed apart from zero", () => {
    expect(paiseFromText("")).toBe(null);
    expect(paiseFromText(null)).toBe(null);
    expect(paiseFromText("0")).toBe(0);
  });

  it("refuses anything that is not a plain amount", () => {
    expect(paiseFromText("abc")).toBe(null);
    expect(paiseFromText("-500")).toBe(null);
    expect(paiseFromText("1.2.3")).toBe(null);
  });
});
