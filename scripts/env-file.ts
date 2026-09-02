import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Read `.env` into `process.env` for a standalone script.
 *
 * Next loads .env itself, so this app has no dotenv dependency and does not need
 * one — but a script run with tsx gets none of that, and a preflight or a restore
 * check that silently sees an empty environment would report a clean bill of
 * health on nothing at all.
 *
 * Never overwrites a variable that is already set, so `NODE_ENV=production pnpm
 * preflight` and a real deployment's environment both win over the file.
 */
export function loadEnvFile(file?: string) {
  const target =
    file ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env");

  let text: string;
  try {
    text = readFileSync(target, "utf8");
  } catch {
    return;
  }

  for (const line of text.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.trim().replace(/^["']|["']$/g, "");
  }
}
