import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RemoteRunner } from "../src/types/remote-command";
import { SshReadOnlyAdapter } from "../src/ui/ssh-read-only-adapter";
import { readExecutionHistory } from "../src/ui/execution-history-reader";

const execFileAsync = promisify(execFile);

/**
 * AC17 - isolated fixture verification.
 *
 * The contract is semantic-data immutability, not "no file may ever appear": the user decided that
 * SQLite's ordinary read-only coordination (a `-shm`/`-wal` sidecar and locks) is allowed, while
 * cron definitions, execution records, output files and schema must not change. A real database is
 * built here, queried through the production read path, and compared byte for byte afterwards. The
 * sidecar outcome is recorded rather than asserted away, because it depends on journal mode and
 * directory permissions.
 */

let dir = "";
let home = "";
let dbPath = "";
let sqliteAvailable = true;

/** Runs the production command locally, so the exact production argv shape is exercised. */
const localRunner: RemoteRunner = async (_file, args, options) => {
  const remoteCommand = args[args.length - 1] ?? "";
  try {
    const { stdout, stderr } = await execFileAsync("/bin/sh", ["-c", remoteCommand], {
      timeout: options.timeoutMs,
      maxBuffer: options.maxBytes + 1024,
    });
    return { stdout, stderr, exitCode: 0, capExceeded: false };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? String(error),
      exitCode: failure.code ?? 1,
      capExceeded: false,
    };
  }
};

function digest(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function listing(path: string): Record<string, { size: number; mtimeMs: number }> {
  const out: Record<string, { size: number; mtimeMs: number }> = {};
  for (const name of readdirSync(path)) {
    const stats = statSync(join(path, name));
    out[name] = { size: stats.size, mtimeMs: stats.mtimeMs };
  }
  return out;
}

beforeAll(async () => {
  try {
    await execFileAsync("/usr/bin/sqlite3", ["--version"]);
  } catch {
    sqliteAvailable = false;
    return;
  }
  dir = mkdtempSync(join(tmpdir(), "hcv-ac17-"));
  home = join(dir, ".hermes");
  dbPath = join(home, "cron", "executions.db");
  await execFileAsync("/bin/mkdir", ["-p", join(home, "cron")]);
  // Mirror the native schema closely enough to exercise the production SELECT.
  await execFileAsync("/usr/bin/sqlite3", [
    dbPath,
    `CREATE TABLE executions (
       id TEXT PRIMARY KEY, job_id TEXT NOT NULL, source TEXT NOT NULL, process_id TEXT,
       pid INTEGER, process_started_at INTEGER, status TEXT NOT NULL, handoff_pending INTEGER,
       handoff_started_at REAL, claimed_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
       error TEXT, delivery_outcome TEXT, scheduled_instant TEXT);
     INSERT INTO executions (id, job_id, source, status, claimed_at, error, delivery_outcome)
       VALUES ('e1','job-a','ticker','completed','2026-09-12T09:00:00+09:00', NULL, 'delivered'),
              ('e2','job-a','ticker','failed','2026-09-11T09:00:00+09:00','boom | pipe', NULL);`,
  ]);
});

afterAll(() => {
  if (dir !== "") rmSync(dir, { recursive: true, force: true });
});

describe("AC17 isolated fixture", () => {
  test("a read-only query leaves semantic data and schema unchanged", async () => {
    if (!sqliteAvailable) {
      expect(sqliteAvailable).toBe(false); // sqlite3 unavailable: recorded, not silently skipped
      return;
    }

    const beforeDigest = digest(dbPath);
    const beforeSchema = (
      await execFileAsync("/usr/bin/sqlite3", [dbPath, "SELECT sql FROM sqlite_master ORDER BY name;"])
    ).stdout;
    const beforeRows = (
      await execFileAsync("/usr/bin/sqlite3", [dbPath, "SELECT id, status, delivery_outcome FROM executions ORDER BY id;"])
    ).stdout;
    const beforeFiles = listing(join(home, "cron"));

    const result = await readExecutionHistory(
      new SshReadOnlyAdapter({ runner: localRunner }),
      { alias: "local-fixture", profileId: "default", home },
      { limit: 50 },
    );

    expect(result.status).toBe("read");
    expect(result.rows.map((row) => row.id)).toEqual(["e1", "e2"]);
    // Row-local delivery evidence survives the real round trip.
    expect(result.rows[0]?.deliveryOutcome).toBe("delivered");
    expect(result.rows[1]?.deliveryOutcome).toBeNull();
    // A body containing a pipe stays intact thanks to the fixed -json contract.
    expect(result.rows[1]?.error).toBe("boom | pipe");

    // Semantic immutability: the database file, its schema and its rows are unchanged.
    expect(digest(dbPath)).toBe(beforeDigest);
    expect(
      (await execFileAsync("/usr/bin/sqlite3", [dbPath, "SELECT sql FROM sqlite_master ORDER BY name;"])).stdout,
    ).toBe(beforeSchema);
    expect(
      (await execFileAsync("/usr/bin/sqlite3", [dbPath, "SELECT id, status, delivery_outcome FROM executions ORDER BY id;"])).stdout,
    ).toBe(beforeRows);

    // Sidecar outcome is recorded, not asserted away: only `-shm`/`-wal` may appear, and no
    // pre-existing file may be modified or removed.
    const afterFiles = listing(join(home, "cron"));
    const appeared = Object.keys(afterFiles).filter((name) => !(name in beforeFiles));
    const removed = Object.keys(beforeFiles).filter((name) => !(name in afterFiles));
    console.log(`AC17 sidecar outcome: appeared=${JSON.stringify(appeared)} removed=${JSON.stringify(removed)}`);
    expect(removed).toEqual([]);
    for (const name of appeared) {
      expect(name.startsWith("executions.db-")).toBe(true);
    }
    for (const [name, stats] of Object.entries(beforeFiles)) {
      if (name === "executions.db") continue;
      expect(afterFiles[name]?.size).toBe(stats.size);
    }
  });

  test("a read-only query never creates the database when it is absent", async () => {
    if (!sqliteAvailable) return;
    const emptyHome = join(dir, "empty", ".hermes");
    await execFileAsync("/bin/mkdir", ["-p", join(emptyHome, "cron")]);

    const result = await readExecutionHistory(
      new SshReadOnlyAdapter({ runner: localRunner }),
      { alias: "local-fixture", profileId: "default", home: emptyHome },
      { limit: 10 },
    );

    expect(result.status).toBe("ledger-unavailable");
    expect(result.rows).toHaveLength(0);
    // The failed read must not have materialized a database file.
    expect(readdirSync(join(emptyHome, "cron"))).toEqual([]);
  });
});
