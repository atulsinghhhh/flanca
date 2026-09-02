/**
 * Giving a school's children their own way in — the rules, pure.
 *
 * Flanca deliberately gave logins to a slice of the roll: a school that switched
 * on this morning does not have an account for every parent, and the product has
 * to look right in that state. That was correct, and it became a limit the day
 * the tutor arrived. A provisioned tutor account has **no usable password** by
 * design — the child enters through the school — so a child with no Flanca login
 * has no way into the tutor at all except through a parent's phone. For a Class 9
 * student that is not good enough.
 *
 * Three decisions live here, and each is the kind that goes wrong quietly.
 */

/** A child, reduced to what an identity needs. */
export interface LoginCandidate {
  admissionNumber: string;
  name: string;
  /** Null when this child already has a login. */
  hasLogin: boolean;
}

/**
 * The domain a school's logins sit on.
 *
 * Taken from the school's own email address when it has one, because
 * `kabir.bhatia.1314@nalandapublic.edu.in` is something a child can read off a
 * slip and a parent recognises. When the school has no address, the fallback is a
 * `.invalid` domain — RFC 2606 reserves it so it can never resolve, which is the
 * honest choice over something that merely looks deliverable.
 *
 * **These are identifiers, not mailboxes.** Nothing in this product sends mail to
 * them, and the screen that issues them says so, because a clerk who believes an
 * address works will use it to send a parent a receipt.
 */
export function loginDomainFor(school: { email?: string | null; slug: string }): {
  domain: string;
  deliverable: boolean;
} {
  const fromEmail = (school.email ?? "").trim().split("@")[1]?.trim().toLowerCase();
  if (fromEmail && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(fromEmail)) {
    return { domain: fromEmail, deliverable: true };
  }
  return { domain: `${school.slug}.flanca.invalid`, deliverable: false };
}

/**
 * The login for one child: a readable local part, unique within the school.
 *
 * The admission number's tail is what makes it unique, not the name — two
 * children called Rachana Yadav in the same class is ordinary, and an identity
 * scheme that treats it as an edge case will fail on the second one. The tail is
 * used rather than the whole number because admission numbers contain slashes
 * (`NPS/1314`) and a slash cannot go in an address.
 */
export function loginFor(child: { name: string; admissionNumber: string }, domain: string): string {
  const slug = child.name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(".");
  const tail = child.admissionNumber.split(/[^A-Za-z0-9]+/).filter(Boolean).pop() ?? child.admissionNumber;
  const local = [slug, tail.toLowerCase()].filter(Boolean).join(".") || tail.toLowerCase();
  return `${local}@${domain}`;
}

/*
 * The alphabet a first password is drawn from.
 *
 * No 0/O, no 1/l/I, no 5/S, no 2/Z. A code that has to survive being written on a
 * slip, carried home in a school bag and typed by an eleven-year-old cannot
 * contain a character they will guess wrong — and "the password does not work" is
 * a phone call to the office, times four hundred.
 *
 * Lower case only, for the same reason: a slip does not say whether a letter was
 * capitalised, and it is not worth the ambiguity.
 */
const ALPHABET = "abcdefghjkmnpqrtuvwxy34679";

/** Eight characters from that alphabet ≈ 37 bits. Fine for a code that must be changed on first use. */
export const FIRST_PASSWORD_LENGTH = 8;

/**
 * Make a first password.
 *
 * `random` is injected so the tests are not at the mercy of Math.random, and so a
 * caller can supply a cryptographic source — which the server action does. A
 * default of Math.random would be a quiet invitation to ship it.
 */
export function firstPassword(random: () => number, length = FIRST_PASSWORD_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    const index = Math.floor(random() * ALPHABET.length) % ALPHABET.length;
    out += ALPHABET[index];
  }
  return out;
}

export interface LoginPlan {
  create: { admissionNumber: string; name: string; email: string }[];
  /** Children who already have one. Never re-issued — see below. */
  skipped: { admissionNumber: string; reason: string }[];
  collisions: string[];
}

/**
 * Work out which children would get a login, before issuing any.
 *
 * **An existing login is never re-issued.** That is the important rule: a second
 * press of the button must not replace the password of a child who has been using
 * theirs for a month, and "give the class logins" is exactly the sort of button
 * that gets pressed twice. Resetting one child's password is a separate,
 * deliberate act on that child.
 *
 * Collisions are reported rather than resolved by appending a number. Two
 * children whose names and admission tails both collide means something is wrong
 * with the roster — most likely a duplicated child — and inventing
 * `rachana.yadav.1317.2@…` would bury it.
 */
export function planLogins(
  children: LoginCandidate[],
  domain: string,
  takenEmails: ReadonlySet<string> = new Set(),
): LoginPlan {
  const create: LoginPlan["create"] = [];
  const skipped: LoginPlan["skipped"] = [];
  const collisions: string[] = [];
  const seen = new Set<string>();

  for (const child of children) {
    if (child.hasLogin) {
      skipped.push({ admissionNumber: child.admissionNumber, reason: "Already has a login." });
      continue;
    }
    if (child.name.trim() === "") {
      skipped.push({ admissionNumber: child.admissionNumber, reason: "No name recorded." });
      continue;
    }

    const email = loginFor(child, domain);
    if (seen.has(email) || takenEmails.has(email.toLowerCase())) {
      collisions.push(email);
      skipped.push({
        admissionNumber: child.admissionNumber,
        reason: `${email} is already taken — check for a duplicated child rather than inventing a second address.`,
      });
      continue;
    }

    seen.add(email);
    create.push({ admissionNumber: child.admissionNumber, name: child.name.trim(), email });
  }

  return { create, skipped, collisions };
}

/**
 * Is this a password a child may keep?
 *
 * Deliberately short on rules. A school of six hundred children forced through a
 * symbol-and-capital policy produces four hundred variations of Password@123 and
 * a queue at the office; the thing that actually matters here is that the slip's
 * code stops working, which is enforced by refusing the one they were given.
 */
export function validateNewPassword(password: string, issued?: string | null): { ok: boolean; reason?: string } {
  const p = password.trim();
  if (p.length < 8) return { ok: false, reason: "Use at least 8 characters." };
  if (p.length > 72) return { ok: false, reason: "That is too long — 72 characters at most." };
  if (issued && p === issued) return { ok: false, reason: "Pick something other than the code on your slip." };
  if (/^\s|\s$/.test(password)) return { ok: false, reason: "It cannot start or end with a space." };
  return { ok: true };
}
