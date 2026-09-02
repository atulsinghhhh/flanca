/**
 * What has to be true before this serves a school.
 *
 * Written because of the specific way a first deployment goes wrong: it works.
 * `AUTH_SECRET="change-me"` boots happily, signs perfectly valid session cookies,
 * and anybody who has read this repository can mint one for the principal. The
 * database URL still pointing at a laptop boots too — right up until the laptop
 * sleeps. None of it announces itself.
 *
 * So the checks are pure and the caller decides what to do with them: refuse to
 * start in production, print and continue in development, or fail a deploy in CI.
 * Same list in all three, which is the point — a check that only runs in CI is a
 * check somebody will skip at 11pm.
 */

export type Severity = "fatal" | "warn";

export interface Finding {
  severity: Severity;
  key: string;
  says: string;
  /** What to actually do about it. Never "check your configuration". */
  fix: string;
}

export interface Environment {
  nodeEnv?: string;
  vars: Record<string, string | undefined>;
}

/**
 * Two lists, because a false FATAL that blocks a deploy is its own outage.
 *
 * The strong ones are phrases no random string produces, so they are matched
 * anywhere in the value. The weak ones are ordinary English words that a genuine
 * 32-byte base64 secret could contain by chance — matching those loosely would
 * one day refuse to start over a perfectly good secret, which is exactly the kind
 * of check people rip out. They have to BE the whole value.
 *
 * The length check does most of the real work anyway: nobody's placeholder is 44
 * characters long.
 */
const STRONG_PLACEHOLDERS = ["change-me", "changeme", "changethis", "replace-me", "your-secret", "yoursecret"];
const EXACT_PLACEHOLDERS = ["secret", "todo", "xxx", "password", "test", "dev"];

function looksLikePlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase().replace(/^["']|["']$/g, "");
  return STRONG_PLACEHOLDERS.some((p) => v.includes(p)) || EXACT_PLACEHOLDERS.includes(v);
}

function isLocal(url: string): boolean {
  return /(^|@|\/\/)(localhost|127\.0\.0\.1|::1|host\.docker\.internal)([:/]|$)/i.test(url);
}

/**
 * A deployment with no school behind it — the landing page and nothing else.
 *
 * It exists because the front door at flanca.online links here, and a link that
 * 404s costs more than a page that says what it is. `FLANCA_PREVIEW=1` is the
 * only way past the DATABASE_URL check, and it buys exactly one thing: the app
 * may boot without a database. It cannot serve a school, because with no
 * database there are no records, and `middleware.ts` closes every route that
 * would reach for one. The AUTH_SECRET rules are untouched — a preview still
 * signs cookies, so a weak secret is as bad here as anywhere.
 */
export function isPreview(vars: Record<string, string | undefined>): boolean {
  const v = (vars.FLANCA_PREVIEW ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Run every check. Production-only rules are decided from `nodeEnv` rather than
 * from a separate flag, so there is one thing to get right.
 */
export function preflight(env: Environment): Finding[] {
  const found: Finding[] = [];
  const production = env.nodeEnv === "production";
  const preview = isPreview(env.vars);
  const v = (key: string) => (env.vars[key] ?? "").trim();

  /* ── the session secret, which is the one that ends badly ───────────── */

  const secret = v("AUTH_SECRET");
  if (secret === "") {
    found.push({
      severity: production ? "fatal" : "warn",
      key: "AUTH_SECRET",
      says: "No AUTH_SECRET. Session cookies cannot be signed.",
      fix: "openssl rand -base64 32",
    });
  } else if (looksLikePlaceholder(secret)) {
    found.push({
      severity: production ? "fatal" : "warn",
      key: "AUTH_SECRET",
      says: `AUTH_SECRET is still the example value ("${secret.slice(0, 12)}…"). Anybody who has read this repository can forge a session for the principal.`,
      fix: "openssl rand -base64 32",
    });
  } else if (secret.length < 32) {
    found.push({
      severity: production ? "fatal" : "warn",
      key: "AUTH_SECRET",
      says: `AUTH_SECRET is only ${secret.length} characters. 32 bytes of base64 is 44.`,
      fix: "openssl rand -base64 32",
    });
  }

  /* ── the database ───────────────────────────────────────────────────── */

  const database = v("DATABASE_URL");
  const direct = v("DIRECT_DATABASE_URL");

  if (database === "") {
    found.push({
      severity: preview ? "warn" : "fatal",
      key: "DATABASE_URL",
      says: preview
        ? "No DATABASE_URL, and FLANCA_PREVIEW is set. This deployment can show the landing page and nothing else: every route that would touch a school's records is closed."
        : "No DATABASE_URL.",
      fix: preview
        ? "Nothing, if a look-around is what was wanted. To make this a real school system, set the pooled connection string and unset FLANCA_PREVIEW."
        : "Point it at the runtime (pooled) endpoint. On Neon that is the -pooler host with ?pgbouncer=true&connection_limit=1.",
    });
  } else if (production && isLocal(database)) {
    found.push({
      severity: "fatal",
      key: "DATABASE_URL",
      says: "Production is pointed at a database on localhost. It will work until the machine it means sleeps.",
      fix: "Use the managed database's pooled connection string.",
    });
  }

  if (production && !preview && direct === "") {
    found.push({
      severity: "warn",
      key: "DIRECT_DATABASE_URL",
      says: "No DIRECT_DATABASE_URL. `prisma migrate deploy` needs an UNPOOLED connection — PgBouncer in transaction mode cannot hold the advisory lock it takes.",
      fix: "Set it to the same database's direct (non-pooler) host.",
    });
  }
  if (production && direct !== "" && /pgbouncer=true/i.test(direct)) {
    found.push({
      severity: "fatal",
      key: "DIRECT_DATABASE_URL",
      says: "DIRECT_DATABASE_URL is a POOLED connection string. Migrations will hang or fail on the advisory lock, and the failure looks like a timeout rather than a misconfiguration.",
      fix: "Remove ?pgbouncer=true and use the direct host.",
    });
  }

  /* ── the URL the app thinks it is at ────────────────────────────────── */

  const authUrl = v("AUTH_URL") || v("NEXTAUTH_URL");
  if (production) {
    if (authUrl === "") {
      found.push({
        severity: "warn",
        key: "AUTH_URL",
        says: "No AUTH_URL. Sign-in redirects are guessed from request headers, which is wrong the first time anything sits in front of this.",
        fix: "Set it to the public https URL, e.g. https://flanca.online.",
      });
    } else if (authUrl.startsWith("http://")) {
      found.push({
        severity: "fatal",
        key: "AUTH_URL",
        says: `AUTH_URL is plain http (${authUrl}). Session cookies for a school's data would travel unencrypted.`,
        fix: "Use https.",
      });
    }
  }

  /* ── the tutor, which is optional and must fail as a unit ───────────── */

  const tutor = {
    url: v("TUTOR_API_URL"),
    ref: v("TUTOR_ORG_REF"),
    key: v("TUTOR_ORG_KEY"),
  };
  const set = Object.entries(tutor).filter(([, value]) => value !== "");
  if (set.length > 0 && set.length < 3) {
    found.push({
      severity: "warn",
      key: "TUTOR_API_URL",
      says: `The tutor is half configured (${set.map(([k]) => k).join(", ")} set). It will behave exactly as if it were not bought at all — every panel absent, no error anywhere.`,
      fix: "Set all three, or none.",
    });
  }
  if (production && tutor.url !== "" && tutor.url.startsWith("http://") && !isLocal(tutor.url)) {
    found.push({
      severity: "fatal",
      key: "TUTOR_API_URL",
      says: "The tutor's provisioning key would be sent over plain http on every request.",
      fix: "Use https.",
    });
  }

  /* ── web push, which degrades quietly and should say so once ────────── */

  const vapidPublic = v("VAPID_PUBLIC_KEY");
  const vapidPrivate = v("VAPID_PRIVATE_KEY");
  if (production && vapidPublic === "" && vapidPrivate === "") {
    found.push({
      severity: "warn",
      key: "VAPID_PUBLIC_KEY",
      says: "No web-push keys. Chat works completely; parents simply never learn a message arrived, which is the whole reason chat replaced WhatsApp.",
      fix: "Generate a VAPID pair — the command is in .env.example.",
    });
  }
  if (vapidPublic !== "" && vapidPrivate === "") {
    found.push({
      severity: "warn",
      key: "VAPID_PRIVATE_KEY",
      says: "A VAPID public key with no private key. Subscriptions will be accepted and no notification can ever be sent.",
      fix: "Set both halves of the pair, or neither.",
    });
  }

  return found;
}

export function fatalities(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.severity === "fatal");
}

/** One block of text, for a log or a terminal. Empty when there is nothing to say. */
export function report(findings: Finding[]): string {
  if (findings.length === 0) return "";
  const lines = findings.map(
    (f) => `  ${f.severity === "fatal" ? "FATAL" : " warn"}  ${f.key}\n         ${f.says}\n         → ${f.fix}`,
  );
  return ["", "── preflight ──", ...lines, ""].join("\n");
}
