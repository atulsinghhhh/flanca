/**
 * Copies the suite front door into Flanca's `public/` so it is served at
 * /suite, and fails loudly if the copy has drifted.
 *
 * WHY A COPY AT ALL. The source of truth is `schoolSuite/web/suite/index.html`
 * — the page belongs to both products, so it lives in the workspace that owns
 * neither. But Flanca deploys on its own, from its own repository, and a build
 * machine will not have the sibling directory. Linking to a page that exists
 * only on a developer's laptop is exactly the dead link this exists to avoid,
 * so the copy is committed.
 *
 * Two copies in git is a drift risk, so drift is made loud rather than trusted:
 *
 *   node scripts/sync-suite-page.mjs          # copy source -> public
 *   node scripts/sync-suite-page.mjs --check  # exit 1 if they differ
 *
 * The --check form is what belongs in CI. If the sibling workspace is absent,
 * both forms are a no-op with a note: a Flanca checkout on its own is a valid
 * thing to build, and it already carries the committed copy.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// ../.. from scripts/ is the schoolSuite workspace root, which holds web/.
const source = resolve(here, "../../web/suite/index.html");
const target = resolve(here, "../public/suite/index.html");
/* The page stopped being one file when it started showing real product
   screenshots. Copying the HTML alone leaves a page of broken images, which is
   a worse dead end than the missing page this script was written to prevent. */
const shotsFrom = resolve(here, "../../web/suite/shots");
const shotsTo = resolve(here, "../public/suite/shots");
const check = process.argv.includes("--check");

if (!existsSync(source)) {
  console.log(`[suite] source not present (${source}) — leaving the committed copy alone.`);
  process.exit(0);
}

const digest = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

/** One hash over a directory's names and contents, so a missing or changed
 *  image counts as drift exactly like a changed line of HTML would. */
function dirDigest(dir) {
  if (!existsSync(dir)) return "";
  const h = createHash("sha256");
  for (const name of readdirSync(dir).sort()) {
    h.update(name).update(readFileSync(join(dir, name)));
  }
  return h.digest("hex");
}

const same =
  existsSync(target) &&
  digest(source) === digest(target) &&
  dirDigest(shotsFrom) === dirDigest(shotsTo);

if (check) {
  if (same) {
    console.log("[suite] public/suite matches the workspace source (page + screenshots).");
    process.exit(0);
  }
  console.error(
    "[suite] public/suite has DRIFTED from schoolSuite/web/suite.\n" +
      "        Run `pnpm suite:sync` and commit the result."
  );
  process.exit(1);
}

if (same) {
  console.log("[suite] already up to date.");
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);

/* Replaced wholesale rather than merged: a screenshot removed upstream must
   disappear here too, or the copy slowly accumulates images nothing references. */
if (existsSync(shotsFrom)) {
  rmSync(shotsTo, { recursive: true, force: true });
  mkdirSync(shotsTo, { recursive: true });
  for (const name of readdirSync(shotsFrom)) copyFileSync(join(shotsFrom, name), join(shotsTo, name));
}

const n = existsSync(shotsFrom) ? readdirSync(shotsFrom).length : 0;
console.log(`[suite] copied → public/suite/index.html (+ ${n} screenshots)`);
