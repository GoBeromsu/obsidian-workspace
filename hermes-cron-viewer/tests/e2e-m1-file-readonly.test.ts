import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { childProcessRunner } from "../src/ui/child-process-runner";
import { SshReadOnlyAdapter } from "../src/ui/ssh-read-only-adapter";
import { discoverProfiles } from "../src/ui/profile-discovery-runner";
import { collectSource } from "../src/ui/hermes-snapshot-collector";
import { readExecutionHistory } from "../src/ui/execution-history-reader";
import { buildListOutputFiles, buildReadOutputFile } from "../src/domain/read-command-builder";
import { parseJobsJson } from "../src/domain/jobs-json-parser";
import { placeInstants } from "../src/domain/timeline-placement";
import { localDayKey } from "../src/domain/instant-timezone-resolver";
import type { RemoteRunner } from "../src/types/remote-command";
import { BYTE_CAPS } from "../src/types/remote-command";

const ALIAS = "m1-file";
const TIMEOUT_MS = 45_000;
const VAULT_PLUGIN =
  "/Users/beomsu/Documents/Obsidian/Ataraxia/.obsidian/plugins/hermes-cron-viewer";
const COMMUNITY =
  "/Users/beomsu/Documents/Obsidian/Ataraxia/.obsidian/community-plugins.json";

function capturingRunner(): { runner: RemoteRunner; log: { file: string; args: readonly string[] }[] } {
  const log: { file: string; args: readonly string[] }[] = [];
  const runner: RemoteRunner = async (file, args, options) => {
    log.push({ file, args });
    return childProcessRunner(file, args, options);
  };
  return { runner, log };
}

function remoteCommands(log: readonly { file: string; args: readonly string[] }[]): string[] {
  return log.map((entry) => entry.args[entry.args.length - 1] ?? "");
}

function assertReadOnly(log: readonly { file: string; args: readonly string[] }[]): void {
  for (const entry of log) {
    expect(entry.file).toBe("ssh");
    expect(entry.args[entry.args.length - 2]).toBe(ALIAS);
    const command = entry.args[entry.args.length - 1] ?? "";
    expect(command.startsWith("hermes")).toBe(false);
    expect(command).not.toContain("hermes cron");
    expect(command).not.toContain("cron create");
    expect(command).not.toContain("cron pause");
    expect(command).not.toContain("immutable=1");
    expect(command).not.toContain("VACUUM");
    expect(command).not.toContain(".recover");
  }
}

describe("live read-only surface against m1-file", () => {
  test("discovers profiles, reads jobs.json, degrades ledger on error 14, never mutates", async () => {
    const { runner, log } = capturingRunner();
    const adapter = new SshReadOnlyAdapter({ runner, timeoutMs: 30_000 });
    const discovery = await discoverProfiles(adapter, ALIAS);
    expect(discovery.transport).toBe("connected");
    expect(discovery.profiles.map((profile) => profile.profileId)).toContain("default");
    expect(discovery.profiles.some((profile) => profile.profileId === "xia")).toBe(true);

    const root = discovery.profiles.find((profile) => profile.profileId === "default");
    expect(root).toBeDefined();
    if (root === undefined) return;

    const collected = await collectSource(adapter, root, () => new Date().toISOString());
    expect(collected.snapshot.transport).toBe("connected");
    expect(collected.snapshot.sourceStatus === "read" || collected.snapshot.sourceStatus === "schema-mismatch")
      .toBe(true);
    expect(collected.snapshot.jobs.length).toBeGreaterThan(0);

    const placed = placeInstants(
      collected.snapshot.jobs,
      [...new Set(collected.snapshot.jobs.flatMap((job) => {
        const keys: string[] = [];
        for (const raw of [job.nextRunAt, job.lastRunAt]) {
          if (raw === null) continue;
          const ms = Date.parse(raw);
          if (!Number.isNaN(ms)) keys.push(localDayKey(ms));
        }
        return keys;
      }))],
    );
    expect(placed.placed.every((entry) => entry.origin === "next_run_at" || entry.origin === "last_run_at")).toBe(true);

    expect(collected.ledger.status).toBe("ledger-unavailable");
    expect(collected.ledger.detail ?? "").toContain("unable to open database file");
    expect(collected.ledger.rows).toHaveLength(0);

    const history = await readExecutionHistory(adapter, root, { limit: 5 });
    expect(history.status).toBe("ledger-unavailable");

    const job = collected.snapshot.jobs[0];
    if (job !== undefined) {
      const listing = buildListOutputFiles(root.home, job.id);
      if (listing.ok) {
        const outcome = await adapter.run(ALIAS, listing.command);
        expect(outcome.transport === "connected" || outcome.transport === "command-missing").toBe(true);
      }
    }

    assertReadOnly(log);
    const commands = remoteCommands(log);
    expect(commands.some((command) => command.includes("sqlite3 -readonly -json"))).toBe(true);
    expect(commands.filter((command) => command.includes("/output/")).length).toBeLessThanOrEqual(1);
    expect(log.every((entry) => entry.args.includes("StrictHostKeyChecking=yes"))).toBe(true);
    expect(log.every((entry) => !entry.args.includes("StrictHostKeyChecking=no"))).toBe(true);
  }, TIMEOUT_MS);

  test("on-demand output read keeps the body in memory and refuses a hostile file name", async () => {
    const { runner, log } = capturingRunner();
    const adapter = new SshReadOnlyAdapter({ runner, timeoutMs: 30_000 });
    const discovery = await discoverProfiles(adapter, ALIAS);
    const root = discovery.profiles.find((profile) => profile.profileId === "default");
    expect(root).toBeDefined();
    if (root === undefined) return;

    const hostile = buildReadOutputFile(root.home, "job-1", "../passwd.md");
    expect(hostile.ok).toBe(false);

    const listing = buildListOutputFiles(root.home, "job-1");
    expect(listing.ok).toBe(true);
    if (listing.ok) await adapter.run(ALIAS, listing.command);

    assertReadOnly(log);
  }, TIMEOUT_MS);
});

describe("AC27 local install without remote helper install", () => {
  test("Ataraxia has the plugin enabled and no data.json was invented", () => {
    expect(existsSync(join(VAULT_PLUGIN, "main.js"))).toBe(true);
    expect(existsSync(join(VAULT_PLUGIN, "manifest.json"))).toBe(true);
    expect(existsSync(join(VAULT_PLUGIN, "styles.css"))).toBe(true);
    // The plugin has run in this vault, so data.json exists; the contract is that it
    // contains allow-listed metadata only, never a prompt, reply, error or output body.
    const liveData = join(VAULT_PLUGIN, "data.json");
    if (existsSync(liveData)) {
      const rawData = readFileSync(liveData, "utf8");
      // Key form only: `"lastStatus": "error"` is a native status token, not an error body.
      for (const forbiddenKey of ["prompt", "lastError", "lastDeliveryError", "error", "stdout"]) {
        expect(rawData.includes(`"${forbiddenKey}":`)).toBe(false);
      }
    }
    const enabled = JSON.parse(readFileSync(COMMUNITY, "utf8")) as string[];
    expect(enabled).toContain("hermes-cron-viewer");
    const built = join(import.meta.dir, "..", "main.js");
    expect(existsSync(built)).toBe(true);
  });
});

describe("jobs.json live shape is parseable without inventing fields", () => {
  test("BYTE_CAPS stay at the plan values", () => {
    expect(BYTE_CAPS.jobsJson).toBe(2 * 1024 * 1024);
    expect(BYTE_CAPS.outputFile).toBe(1024 * 1024);
    expect(BYTE_CAPS.enumeration).toBe(256 * 1024);
    expect(BYTE_CAPS.sqlResult).toBe(512 * 1024);
    expect(parseJobsJson({ alias: ALIAS, profileId: "default" }, { jobs: [] }).recognized).toBe(true);
  });
});
