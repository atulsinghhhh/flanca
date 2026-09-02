import { fatalities, preflight, report } from "@/lib/preflight";

/**
 * Runs once, when the server starts, before it serves anything.
 *
 * This is the only hook in Next that can stop a bad deployment from becoming a
 * live one. Everything it checks would otherwise boot happily: `AUTH_SECRET`
 * still set to the example value signs perfectly valid cookies, and a production
 * app pointed at a laptop's Postgres works right up until the laptop sleeps.
 *
 * In production a fatal finding throws, which fails the deploy. In development it
 * prints and carries on — a dev machine is allowed to be a dev machine, and a
 * check that stops local work is a check somebody deletes.
 */
export async function register() {
  const findings = preflight({
    nodeEnv: process.env.NODE_ENV,
    vars: process.env as Record<string, string | undefined>,
  });

  const text = report(findings);
  if (text) console.warn(text);

  const fatal = fatalities(findings);
  if (fatal.length > 0) {
    throw new Error(
      `Refusing to start: ${fatal.length} fatal configuration problem${fatal.length === 1 ? "" : "s"} — ` +
        fatal.map((f) => f.key).join(", ") +
        ". See the preflight output above.",
    );
  }
}
