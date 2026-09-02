/**
 * Proves the backup by restoring it.
 *
 *   pnpm verify-restore
 *   pnpm verify-restore --keep      # leave the restored copy for inspection
 *
 * "The provider takes backups" and "we can get a school's data back" are
 * different claims, and only one of them is checkable. A school asks the second
 * question — usually as *"what happens to my data if you disappear"* — and the
 * honest answer needs a rehearsal behind it.
 *
 * What this does: dumps the live database, creates a scratch one beside it,
 * restores into it, then compares **every table's row count** between the two and
 * prints any that differ. Then drops the scratch, unless told not to.
 *
 * It is deliberately a restore into a *separate database* rather than a
 * point-in-time exercise on the real one. Nothing here can touch live data — the
 * only statements aimed at the original are SELECTs and a pg_dump.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvFile } from "./env-file";

loadEnvFile();

/** Prefer a real DIRECT connection: a pooler cannot CREATE DATABASE. */
const RAW = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!RAW) {
  console.error("Set DATABASE_URL (or DIRECT_DATABASE_URL) first.");
  process.exit(1);
}

const url = new URL(RAW);
const source = url.pathname.replace(/^\//, "").split("?")[0];
const scratch = `${source}_restore_check`;

/** The same server, a different database. */
function serverUrl(database: string): string {
  const u = new URL(RAW!);
  u.pathname = `/${database}`;
  u.search = "";
  return u.toString();
}

function run(command: string, args: string[], input?: string): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 512,
    input,
    env: { ...process.env },
  });
}

function psql(database: string, sql: string): string {
  return run("psql", [serverUrl(database), "-tAq", "-v", "ON_ERROR_STOP=1", "-c", sql]);
}

function tableCounts(database: string): Map<string, number> {
  /*
   * Counted with count(*) per table rather than read from pg_class.reltuples,
   * which is an estimate maintained by ANALYZE and is routinely wrong right
   * after a restore — the one moment this script looks at it.
   */
  const tables = psql(
    database,
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  )
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const union = tables
    .map((t) => `SELECT '${t}' AS t, count(*) AS n FROM "${t}"`)
    .join(" UNION ALL ");

  const out = new Map<string, number>();
  if (tables.length === 0) return out;

  for (const line of psql(database, union).split("\n")) {
    const [name, n] = line.split("|");
    if (name) out.set(name.trim(), Number(n));
  }
  return out;
}

function main() {
  console.log(`\nsource database: ${source} on ${url.hostname}:${url.port || 5432}`);

  const before = tableCounts(source);
  const rows = [...before.values()].reduce((a, b) => a + b, 0);
  console.log(`${before.size} tables, ${rows} rows\n`);

  const dir = mkdtempSync(path.join(tmpdir(), "flanca-restore-"));
  const dumpFile = path.join(dir, `${source}.dump`);

  try {
    console.log("dumping…");
    run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", dumpFile, serverUrl(source)]);
    const size = statSync(dumpFile).size;
    console.log(`  ${(size / 1024 / 1024).toFixed(1)} MB\n`);

    console.log(`restoring into ${scratch}…`);
    // Dropped first so a previous interrupted run cannot make this pass by
    // comparing against its own leftovers.
    psql("postgres", `DROP DATABASE IF EXISTS "${scratch}"`);
    psql("postgres", `CREATE DATABASE "${scratch}"`);
    run("pg_restore", ["--no-owner", "--no-privileges", "--dbname", serverUrl(scratch), dumpFile]);

    const after = tableCounts(scratch);
    console.log(`  ${after.size} tables restored\n`);

    const differences: string[] = [];
    for (const [table, n] of before) {
      const got = after.get(table);
      if (got === undefined) differences.push(`${table}: MISSING from the restore (${n} rows lost)`);
      else if (got !== n) differences.push(`${table}: ${n} → ${got}`);
    }
    for (const table of after.keys()) {
      if (!before.has(table)) differences.push(`${table}: appeared in the restore but is not in the source`);
    }

    /*
     * A spot check with real content, not only counts. Equal counts can hide a
     * restore that dropped a column's contents, and money is the column where
     * that would matter most.
     */
    const money = (db: string) =>
      psql(db, `SELECT coalesce(sum(amount), 0) FROM "FeePayment" WHERE "reversedAt" IS NULL`).trim();
    const moneyBefore = money(source);
    const moneyAfter = money(scratch);

    console.log(`fees collected, source:  ${moneyBefore} paise`);
    console.log(`fees collected, restore: ${moneyAfter} paise`);

    if (differences.length === 0 && moneyBefore === moneyAfter) {
      console.log(`\n✓ restore matches the source, table for table and rupee for rupee.\n`);
    } else {
      console.log(`\n✗ the restore does NOT match:`);
      for (const d of differences) console.log(`    ${d}`);
      if (moneyBefore !== moneyAfter) console.log(`    fee total differs`);
      console.log("");
      process.exitCode = 1;
    }

    if (process.argv.includes("--keep")) {
      console.log(`kept: ${scratch} (drop it with: dropdb ${scratch})\n`);
    } else {
      psql("postgres", `DROP DATABASE IF EXISTS "${scratch}"`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main();
