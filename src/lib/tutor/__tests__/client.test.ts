/**
 * Checkpoint 1 of the integrity checklist, as a test instead of a manual poke:
 * point Flanca at a dead tutor and nothing breaks.
 *
 * Every one of these asserts that a failure came back as a VALUE. If any of them
 * ever fails by throwing, the two-eyes rule has stopped being true and a page
 * somewhere renders a 500 because a second product is down.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchCohort,
  fetchSeats,
  mintHandoffUrl,
  pushRoster,
  tutorConfig,
  tutorUnavailableMessage,
  READ_TIMEOUT_MS,
} from "../client";

const ENV = { TUTOR_API_URL: "http://tutor.test", TUTOR_ORG_REF: "school-a", TUTOR_ORG_KEY: "flk_secret" };

function configure(on = true) {
  for (const [k, v] of Object.entries(ENV)) {
    if (on) process.env[k] = v;
    else delete process.env[k];
  }
}

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

beforeEach(() => configure(true));
afterEach(() => {
  configure(false);
  vi.useRealTimers();
});

describe("not configured is not an error", () => {
  it('reports "off" when the tutor was never set up, without calling anything', async () => {
    configure(false);
    const spy = vi.fn();
    expect(await fetchCohort({}, spy as unknown as typeof fetch)).toEqual({ state: "off" });
    expect(await fetchSeats(spy as unknown as typeof fetch)).toEqual({ state: "off" });
    expect(await pushRoster([], {}, spy as unknown as typeof fetch)).toEqual({ state: "off" });
    expect(await mintHandoffUrl("1001", spy as unknown as typeof fetch)).toEqual({ state: "off" });
    // Nothing was even attempted — a school without the tutor generates no traffic.
    expect(spy).not.toHaveBeenCalled();
  });

  it('says nothing to a person when it is "off"', () => {
    // A school that has not bought the tutor must not see a hole where a feature
    // they do not have would go.
    expect(tutorUnavailableMessage({ state: "off" })).toBeNull();
  });

  it("treats a half-configured tutor as off rather than guessing", async () => {
    delete process.env.TUTOR_ORG_KEY;
    expect(tutorConfig()).toBeNull();
    expect(await fetchCohort({}, vi.fn() as unknown as typeof fetch)).toEqual({ state: "off" });
  });
});

describe("a dead tutor is a value, never a throw", () => {
  it("survives connection refused", async () => {
    const dead = vi.fn().mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { name: "TypeError" }));
    const r = await fetchCohort({}, dead as unknown as typeof fetch);
    expect(r.state).toBe("unreachable");
    expect(tutorUnavailableMessage(r)).toMatch(/Everything else here is unaffected/);
  });

  it("survives DNS failure", async () => {
    const dead = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND tutor.test"));
    expect((await fetchSeats(dead as unknown as typeof fetch)).state).toBe("unreachable");
  });

  it("survives a body that is not JSON at all", async () => {
    const garbage = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    } as unknown as Response);
    expect((await fetchCohort({}, garbage as unknown as typeof fetch)).state).toBe("unreachable");
  });

  it("gives up rather than holding a page render open", async () => {
    // The dangerous failure is not refusal, it is a tutor that accepts the
    // connection and never answers.
    const hang = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }),
    );
    const r = await fetchCohort({}, hang as unknown as typeof fetch);
    expect(r.state).toBe("unreachable");
    expect(r.state === "unreachable" && r.detail).toMatch(new RegExp(`no answer in ${READ_TIMEOUT_MS}ms`));
  });
});

describe("a refusal is different information from a failure", () => {
  it("passes a suspended school's own words through", async () => {
    const refused = vi.fn().mockResolvedValue(jsonResponse({ error: "Nalanda's account is not active." }, 403));
    const r = await fetchCohort({}, refused as unknown as typeof fetch);
    expect(r).toMatchObject({ state: "refused", status: 403 });
    expect(tutorUnavailableMessage(r)).toBe("Nalanda's account is not active.");
  });

  it("reads a 404 as 'not provisioned yet' rather than as a refusal", async () => {
    // What the tutor actually answers for a child whose class was never sent.
    const missing = vi.fn().mockResolvedValue(
      jsonResponse({ error: "No student with admission number NPS/1718 at this school." }, 404),
    );
    const r = await fetchCohort({}, missing as unknown as typeof fetch);
    expect(r).toMatchObject({ state: "refused", status: 404 });
    // A child and their parent must not be told the tutor "refused" something
    // that one click in the office fixes.
    expect(tutorUnavailableMessage(r)).toMatch(/no tutor account for this child yet/i);
    expect(tutorUnavailableMessage(r)).not.toMatch(/refused/i);
  });

  it("does not repeat a raw 401 at a person", async () => {
    const refused = vi.fn().mockResolvedValue(jsonResponse({ error: "Unknown school or invalid key." }, 401));
    const r = await fetchCohort({}, refused as unknown as typeof fetch);
    expect(r.state).toBe("refused");
    // "invalid key" is our problem, not something to put in front of a clerk.
    expect(tutorUnavailableMessage(r)).toMatch(/check the school's tutor subscription/);
  });

  it("copes with a refusal whose body is not JSON", async () => {
    const html = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("no");
      },
    } as unknown as Response);
    const r = await html(""); // sanity: the stub itself behaves
    expect(r.status).toBe(502);
    const result = await fetchCohort({}, html as unknown as typeof fetch);
    expect(result).toMatchObject({ state: "refused", status: 502, detail: "502" });
  });
});

describe("the happy path, and what it must not do", () => {
  it("returns the cohort in the order the tutor sent it", async () => {
    // Lowest coverage first. Re-sorting on arrival would undo the tutor's
    // refusal to produce a leaderboard, from the other side of the seam.
    const students = [
      { admissionNumber: "3", name: "Zoya", coverage: 0.05, mastery: null, caveat: "…", repeatedMistakes: [], chaptersStarted: 0, lastActive: null, classLevel: "7" },
      { admissionNumber: "1", name: "Aarav", coverage: 0.4, mastery: 0.9, caveat: "…", repeatedMistakes: [], chaptersStarted: 3, lastActive: null, classLevel: "7" },
    ];
    const ok = vi.fn().mockResolvedValue(jsonResponse({ school: "Nalanda", classLevel: "7", students, topicsInScope: 20 }));
    const r = await fetchCohort({ classLevel: "7" }, ok as unknown as typeof fetch);
    expect(r.state).toBe("ok");
    expect(r.state === "ok" && r.data.students.map((s) => s.name)).toEqual(["Zoya", "Aarav"]);
    expect(tutorUnavailableMessage(r)).toBeNull();
  });

  it("sends the key in a header and the school in the query, never the other way round", async () => {
    const ok = vi.fn().mockResolvedValue(jsonResponse({ school: "N", students: [], topicsInScope: 0, classLevel: null }));
    await fetchCohort({ classLevel: "7" }, ok as unknown as typeof fetch);

    const [url, init] = ok.mock.calls[0] as [string, RequestInit];
    // A key in a URL ends up in access logs, proxy logs and a Referer header.
    expect(url).not.toContain("flk_secret");
    expect(url).toContain("externalRef=school-a");
    expect(url).toContain("classLevel=7");
    expect((init.headers as Record<string, string>)["X-Org-Key"]).toBe("flk_secret");
  });

  it("asks for a roster preview when told to", async () => {
    const ok = vi.fn().mockResolvedValue(jsonResponse({ dryRun: true, school: "N", counts: { create: 1, update: 0, withdraw: 0, skip: 0 }, decisions: [] }));
    await pushRoster([{ admissionNumber: "1001", name: "A", className: "Class 7" }], { dryRun: true }, ok as unknown as typeof fetch);
    const body = JSON.parse(((ok.mock.calls[0] as [string, RequestInit])[1].body as string));
    expect(body).toMatchObject({ dryRun: true, externalRef: "school-a" });
  });

  it("gives a roster longer than a panel gets", async () => {
    const ok = vi.fn().mockResolvedValue(jsonResponse({ school: "N", created: 0, updated: 0, withdrawn: 0, seatsUsed: 0, seatCap: null, skipped: [] }));
    await pushRoster([], {}, ok as unknown as typeof fetch);
    // A roster of six hundred children is a different kind of wait to a panel,
    // and cutting it off at 2.5s would half-provision a school.
    expect((ok.mock.calls[0] as [string, RequestInit & { timeoutMs?: number }])[1].timeoutMs).toBeGreaterThan(READ_TIMEOUT_MS);
  });
});
