/**
 * The same checks the server runs at boot, runnable before you deploy.
 *
 *   pnpm preflight
 *   NODE_ENV=production pnpm preflight
 *
 * Exits 1 on a fatal finding, so it can gate a deploy. Deliberately the same
 * module `instrumentation.ts` uses rather than a second list that drifts — a
 * check that only runs in CI is a check somebody skips at 11pm.
 */
import { fatalities, preflight, report } from "../src/lib/preflight";
import { loadEnvFile } from "./env-file";


loadEnvFile();

const findings = preflight({
  nodeEnv: process.env.NODE_ENV,
  vars: process.env as Record<string, string | undefined>,
});
const text = report(findings);

if (!text) {
  console.log(`preflight: nothing to say (NODE_ENV=${process.env.NODE_ENV ?? "unset"}).`);
} else {
  console.log(text);
  const fatal = fatalities(findings);
  if (fatal.length > 0) {
    console.error(`preflight: ${fatal.length} fatal — ${fatal.map((f) => f.key).join(", ")}. Not fit to deploy.`);
    process.exit(1);
  }
  console.log(`preflight: ${findings.length} warning${findings.length === 1 ? "" : "s"}, nothing fatal.`);
}
