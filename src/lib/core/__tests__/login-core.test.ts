import { describe, expect, it } from "vitest";
import {
  FIRST_PASSWORD_LENGTH,
  firstPassword,
  loginDomainFor,
  loginFor,
  planLogins,
  validateNewPassword,
} from "../login-core";

describe("loginDomainFor", () => {
  it("uses the school's own domain, because a child has to read it off a slip", () => {
    expect(loginDomainFor({ email: "office@nalandapublic.edu.in", slug: "nalanda" })).toEqual({
      domain: "nalandapublic.edu.in",
      deliverable: true,
    });
  });

  it("falls back to a domain that can never resolve, rather than one that looks deliverable", () => {
    const d = loginDomainFor({ email: null, slug: "nalanda-public-school" });
    expect(d.domain).toBe("nalanda-public-school.flanca.invalid");
    expect(d.deliverable).toBe(false);
  });

  it("ignores a malformed school address instead of building logins on it", () => {
    expect(loginDomainFor({ email: "not-an-email", slug: "s" }).deliverable).toBe(false);
    expect(loginDomainFor({ email: "office@localhost", slug: "s" }).deliverable).toBe(false);
  });
});

describe("loginFor", () => {
  it("reads like a name and ends in the admission tail", () => {
    expect(loginFor({ name: "Kabir Bhatia", admissionNumber: "NPS/1314" }, "school.edu.in")).toBe(
      "kabir.bhatia.1314@school.edu.in",
    );
  });

  it("separates two children with the same name, which is ordinary in one class", () => {
    const a = loginFor({ name: "Rachana Yadav", admissionNumber: "NPS/1317" }, "s.in");
    const b = loginFor({ name: "Rachana Yadav", admissionNumber: "NPS/1343" }, "s.in");
    expect(a).not.toBe(b);
  });

  it("keeps two names, not five", () => {
    expect(loginFor({ name: "Fatima Noor Sheikh Ahmed", admissionNumber: "1004" }, "s.in")).toBe(
      "fatima.noor.1004@s.in",
    );
  });

  it("survives punctuation and stray spacing in a name", () => {
    expect(loginFor({ name: "  D'Souza,  Maria ", admissionNumber: "NPS/12" }, "s.in")).toBe("dsouza.maria.12@s.in");
  });

  it("still produces something usable for a name with no letters at all", () => {
    expect(loginFor({ name: "—", admissionNumber: "NPS/99" }, "s.in")).toBe("99@s.in");
  });
});

describe("firstPassword", () => {
  it("avoids every character a child could copy wrong off a slip", () => {
    const many = Array.from({ length: 200 }, (_, i) => firstPassword(() => (i * 37 % 100) / 100)).join("");
    expect(many).not.toMatch(/[0O1lI5S2Zioz]/);
    expect(many).toMatch(/^[a-z34679]+$/);
  });

  it("is the stated length", () => {
    expect(firstPassword(() => 0.5)).toHaveLength(FIRST_PASSWORD_LENGTH);
    expect(firstPassword(() => 0.5, 12)).toHaveLength(12);
  });

  it("does not run off the end of the alphabet when random returns 1", () => {
    expect(firstPassword(() => 0.999999)).toMatch(/^[a-z34679]{8}$/);
    expect(firstPassword(() => 1)).toMatch(/^[a-z34679]{8}$/);
  });
});

describe("planLogins", () => {
  const child = (over: Partial<Parameters<typeof planLogins>[0][number]> = {}) => ({
    admissionNumber: "NPS/1001",
    name: "Kabir Bhatia",
    hasLogin: false,
    ...over,
  });

  it("issues one to each child who has none", () => {
    const plan = planLogins([child(), child({ admissionNumber: "NPS/1002", name: "Zoya Khan" })], "s.in");
    expect(plan.create).toHaveLength(2);
    expect(plan.create[0].email).toBe("kabir.bhatia.1001@s.in");
  });

  it("NEVER re-issues to a child who already has one — the button gets pressed twice", () => {
    const plan = planLogins([child({ hasLogin: true })], "s.in");
    expect(plan.create).toEqual([]);
    expect(plan.skipped[0].reason).toMatch(/already has a login/i);
  });

  it("reports a collision instead of inventing a second address for the same child", () => {
    const plan = planLogins([child(), child()], "s.in");
    expect(plan.create).toHaveLength(1);
    expect(plan.collisions).toEqual(["kabir.bhatia.1001@s.in"]);
    expect(plan.skipped[0].reason).toMatch(/duplicated child/);
  });

  it("respects an address already used by somebody else in the database", () => {
    const plan = planLogins([child()], "s.in", new Set(["kabir.bhatia.1001@s.in"]));
    expect(plan.create).toEqual([]);
  });

  it("skips a child with no name rather than building an address out of nothing", () => {
    const plan = planLogins([child({ name: "   " })], "s.in");
    expect(plan.create).toEqual([]);
    expect(plan.skipped[0].reason).toMatch(/no name/i);
  });
});

describe("validateNewPassword", () => {
  it("accepts something ordinary", () => {
    expect(validateNewPassword("mydogisred")).toEqual({ ok: true });
  });

  it("refuses the code from the slip, which is the whole point of the flag", () => {
    expect(validateNewPassword("qhkm4t7v", "qhkm4t7v")).toEqual({
      ok: false,
      reason: "Pick something other than the code on your slip.",
    });
  });

  it("refuses one too short to be worth having", () => {
    expect(validateNewPassword("short").ok).toBe(false);
  });

  it("refuses one bcrypt would silently truncate", () => {
    expect(validateNewPassword("x".repeat(100)).ok).toBe(false);
  });

  it("refuses leading or trailing space, which nobody can see they typed", () => {
    expect(validateNewPassword(" mydogisred").ok).toBe(false);
    expect(validateNewPassword("mydogisred ").ok).toBe(false);
  });
});
