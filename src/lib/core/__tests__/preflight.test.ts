import { describe, expect, it } from "vitest";
import { fatalities, preflight, report } from "../../preflight";

const prod = (vars: Record<string, string | undefined>) => ({ nodeEnv: "production", vars });
const dev = (vars: Record<string, string | undefined>) => ({ nodeEnv: "development", vars });

const HEALTHY = {
  AUTH_SECRET: "eOx5rXQ2s9wVn1kZ7bJm4pT8yA0cLdFgHiJkLmNoPqR=",
  DATABASE_URL: "postgresql://u:p@ep-cool-1-pooler.ap-southeast-1.aws.neon.tech/flanca?pgbouncer=true&connection_limit=1",
  DIRECT_DATABASE_URL: "postgresql://u:p@ep-cool-1.ap-southeast-1.aws.neon.tech/flanca",
  AUTH_URL: "https://flanca.online",
  VAPID_PUBLIC_KEY: "pub",
  VAPID_PRIVATE_KEY: "priv",
};

describe("the session secret — the one that ends badly", () => {
  it("refuses the example value in production, and says why it matters", () => {
    const f = preflight(prod({ ...HEALTHY, AUTH_SECRET: "change-me" }));
    const secret = f.find((x) => x.key === "AUTH_SECRET")!;
    expect(secret.severity).toBe("fatal");
    expect(secret.says).toMatch(/forge a session/i);
    expect(secret.fix).toMatch(/openssl rand/);
  });

  it("catches the placeholder however it was written", () => {
    for (const bad of ["change-me", "CHANGE-ME", '"change-me"', "changeme", "replace-me-please", "todo"]) {
      expect(preflight(prod({ ...HEALTHY, AUTH_SECRET: bad })).some((x) => x.key === "AUTH_SECRET")).toBe(true);
    }
  });

  it("catches a secret that is simply too short", () => {
    expect(preflight(prod({ ...HEALTHY, AUTH_SECRET: "abcdefghij" }))[0].says).toMatch(/only 10 characters/);
  });

  it("only warns in development, because a dev machine is allowed to be a dev machine", () => {
    const f = preflight(dev({ ...HEALTHY, AUTH_SECRET: "change-me" }));
    expect(f.find((x) => x.key === "AUTH_SECRET")!.severity).toBe("warn");
    expect(fatalities(f)).toEqual([]);
  });
});

describe("the database", () => {
  it("refuses a production app pointed at a laptop", () => {
    const f = preflight(prod({ ...HEALTHY, DATABASE_URL: "postgresql://me@localhost:5432/flanca_dev" }));
    expect(f.find((x) => x.key === "DATABASE_URL")!.severity).toBe("fatal");
  });

  it("refuses a POOLED migration URL, because the failure looks like a timeout", () => {
    const f = preflight(prod({ ...HEALTHY, DIRECT_DATABASE_URL: "postgresql://u:p@x-pooler.neon.tech/db?pgbouncer=true" }));
    const direct = f.find((x) => x.key === "DIRECT_DATABASE_URL")!;
    expect(direct.severity).toBe("fatal");
    expect(direct.says).toMatch(/advisory lock/);
  });

  it("misses nothing on a healthy production configuration", () => {
    expect(preflight(prod(HEALTHY))).toEqual([]);
  });

  it("lets a preview boot without one, and says what that deployment can do", () => {
    const { DATABASE_URL, DIRECT_DATABASE_URL, ...rest } = HEALTHY;
    const f = preflight(prod({ ...rest, FLANCA_PREVIEW: "1" }));
    const database = f.find((x) => x.key === "DATABASE_URL")!;
    expect(database.severity).toBe("warn");
    expect(database.says).toMatch(/landing page and nothing else/i);
    expect(fatalities(f)).toEqual([]);
  });

  it("keeps refusing a weak secret in a preview — a preview signs cookies too", () => {
    const { DATABASE_URL, DIRECT_DATABASE_URL, ...rest } = HEALTHY;
    const f = preflight(prod({ ...rest, AUTH_SECRET: "change-me", FLANCA_PREVIEW: "1" }));
    expect(fatalities(f).map((x) => x.key)).toEqual(["AUTH_SECRET"]);
  });

  it("only counts the flag when it was set on purpose", () => {
    for (const off of [undefined, "", "0", "false", "no"]) {
      const { DATABASE_URL, DIRECT_DATABASE_URL, ...rest } = HEALTHY;
      const f = preflight(prod({ ...rest, FLANCA_PREVIEW: off }));
      expect(fatalities(f).map((x) => x.key)).toEqual(["DATABASE_URL"]);
    }
  });
});

describe("https, because these are children's records", () => {
  it("refuses plain http for the app's own URL", () => {
    expect(preflight(prod({ ...HEALTHY, AUTH_URL: "http://flanca.online" }))[0].severity).toBe("fatal");
  });

  it("refuses to send the tutor's provisioning key over plain http", () => {
    const f = preflight(prod({ ...HEALTHY, TUTOR_API_URL: "http://tutor.example.com", TUTOR_ORG_REF: "s", TUTOR_ORG_KEY: "k" }));
    expect(f.find((x) => x.key === "TUTOR_API_URL")!.severity).toBe("fatal");
  });

  it("allows plain http to a tutor on localhost, which is how it is developed", () => {
    const f = preflight(prod({ ...HEALTHY, TUTOR_API_URL: "http://localhost:4001", TUTOR_ORG_REF: "s", TUTOR_ORG_KEY: "k" }));
    expect(f.filter((x) => x.key === "TUTOR_API_URL")).toEqual([]);
  });
});

describe("half-configured things, which are worse than absent ones", () => {
  it("catches a tutor with two of its three variables", () => {
    const f = preflight(prod({ ...HEALTHY, TUTOR_API_URL: "https://tutor.example.com", TUTOR_ORG_REF: "school" }));
    const tutor = f.find((x) => x.key === "TUTOR_API_URL")!;
    expect(tutor.says).toMatch(/as if it were not bought/);
  });

  it("says nothing at all when the tutor is deliberately absent", () => {
    expect(preflight(prod(HEALTHY)).filter((x) => x.key.startsWith("TUTOR"))).toEqual([]);
  });

  it("catches a VAPID public key with no private half", () => {
    const f = preflight(prod({ ...HEALTHY, VAPID_PRIVATE_KEY: "" }));
    expect(f.find((x) => x.key === "VAPID_PRIVATE_KEY")!.says).toMatch(/no notification can ever be sent/);
  });
});

describe("report", () => {
  it("is empty when there is nothing to say, so a clean boot stays quiet", () => {
    expect(report([])).toBe("");
  });

  it("prints the fix, not just the complaint", () => {
    const text = report(preflight(prod({ ...HEALTHY, AUTH_SECRET: "change-me" })));
    expect(text).toMatch(/FATAL/);
    expect(text).toMatch(/openssl rand -base64 32/);
  });
});

describe("not crying wolf, which is how a check gets deleted", () => {
  it("accepts a real 32-byte base64 secret that happens to contain an English word", () => {
    // "secret" and "todo" both occur inside these; neither is a placeholder.
    for (const real of [
      "aB3secretXyZ9kLmNoPqRsTuVwXyZ0123456789abcd=",
      "todoQ2s9wVn1kZ7bJm4pT8yA0cLdFgHiJkLmNoPqR=",
    ]) {
      const f = preflight(prod({ ...HEALTHY, AUTH_SECRET: real }));
      expect(f.filter((x) => x.key === "AUTH_SECRET")).toEqual([]);
    }
  });

  it("still refuses a bare word used as the whole secret", () => {
    for (const bare of ["secret", "password", "dev", "TEST"]) {
      expect(preflight(prod({ ...HEALTHY, AUTH_SECRET: bare })).some((x) => x.key === "AUTH_SECRET")).toBe(true);
    }
  });
});
