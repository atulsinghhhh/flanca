import { describe, expect, it } from "vitest";
import { apaarCoverage, daysToFreeze, deriveApaarState, nameMismatch, nextAction } from "../apaar-core";

describe("deriveApaarState — the stored column never lies about compliance", () => {
  it("is ISSUED whenever an APAAR id exists, whatever the column says", () => {
    expect(deriveApaarState({ id: "1", name: "A", apaarId: "123456789012", apaarStatus: "NOT_STARTED" })).toBe("ISSUED");
  });

  it("blank apaarId does not count as issued", () => {
    expect(deriveApaarState({ id: "1", name: "A", apaarId: "   ", consentGranted: true })).toBe("NOT_STARTED");
  });

  it("shows consent pending before consent is captured", () => {
    expect(deriveApaarState({ id: "1", name: "A" })).toBe("CONSENT_PENDING");
  });

  it("surfaces a refusal and a mismatch", () => {
    expect(deriveApaarState({ id: "1", name: "A", consentRefused: true })).toBe("CONSENT_REFUSED");
    expect(deriveApaarState({ id: "1", name: "A", apaarStatus: "MISMATCH", consentGranted: true })).toBe("MISMATCH");
  });

  it("gives the office a concrete next step for every state", () => {
    expect(nextAction("MISMATCH")).toMatch(/mismatch/i);
    expect(nextAction("ISSUED")).toMatch(/nothing pending/i);
  });
});

describe("apaarCoverage — can this school certify on UDISE+?", () => {
  it("counts blockers and refuses to certify while any remain", () => {
    const c = apaarCoverage([
      { id: "1", name: "A", apaarId: "111" },
      { id: "2", name: "B", apaarId: "222" },
      { id: "3", name: "C" },
      { id: "4", name: "D", consentRefused: true },
    ]);
    expect(c.total).toBe(4);
    expect(c.issued).toBe(2);
    expect(c.blocking).toBe(2);
    expect(c.coverageBp).toBe(5000);
    expect(c.canCertify).toBe(false);
    expect(c.byState.CONSENT_PENDING).toBe(1);
    expect(c.byState.CONSENT_REFUSED).toBe(1);
  });

  it("certifies only when every single student has an id", () => {
    const c = apaarCoverage([{ id: "1", name: "A", apaarId: "111" }]);
    expect(c.canCertify).toBe(true);
    expect(c.coverageBp).toBe(10000);
  });

  it("an empty school is not a certifiable school", () => {
    expect(apaarCoverage([]).canCertify).toBe(false);
  });
});

describe("nameMismatch — catch it before wasting a portal submission", () => {
  it("passes an exact match, ignoring case and honorifics", () => {
    expect(nameMismatch("Aarav Sharma", "AARAV SHARMA").matches).toBe(true);
    expect(nameMismatch("Aarav Sharma", "Master Aarav Sharma").matches).toBe(true);
  });

  it("flags a missing Aadhaar name", () => {
    const r = nameMismatch("Aarav Sharma", null);
    expect(r.matches).toBe(false);
    expect(r.reason).toMatch(/not recorded/i);
  });

  it("detects reordered names", () => {
    const r = nameMismatch("Aarav Sharma", "Sharma Aarav");
    expect(r.matches).toBe(false);
    expect(r.confidence).toBe("LIKELY");
    expect(r.reason).toMatch(/different order/i);
  });

  it("detects an extra middle name on Aadhaar", () => {
    const r = nameMismatch("Aarav Sharma", "Aarav Kumar Sharma");
    expect(r.reason).toMatch(/extra name part: kumar/i);
    expect(r.confidence).toBe("LIKELY");
  });

  it("detects a name part missing from Aadhaar", () => {
    const r = nameMismatch("Aarav Kumar Sharma", "Aarav Sharma");
    expect(r.reason).toMatch(/missing: kumar/i);
  });

  it("detects an initial standing in for a full name", () => {
    const r = nameMismatch("Rajesh Kumar", "R Kumar");
    expect(r.confidence).toBe("LIKELY");
    expect(r.reason).toMatch(/initial/i);
  });

  it("calls a genuinely different name a mismatch", () => {
    expect(nameMismatch("Aarav Sharma", "Priya Menon").confidence).toBe("MISMATCH");
  });
});

describe("daysToFreeze", () => {
  it("counts down to the 30 September certification freeze", () => {
    expect(daysToFreeze(new Date(Date.UTC(2026, 8, 20)))).toBe(10);
    expect(daysToFreeze(new Date(Date.UTC(2026, 8, 30)))).toBe(0);
  });

  it("goes negative once the freeze has passed", () => {
    expect(daysToFreeze(new Date(Date.UTC(2026, 9, 5)))).toBeLessThan(0);
  });
});
