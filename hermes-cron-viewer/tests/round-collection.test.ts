import { describe, expect, test } from "bun:test";
import type { RemoteRunner } from "../src/types/remote-command";
import { SshReadOnlyAdapter } from "../src/ui/ssh-read-only-adapter";
import { collectRound, collectSource } from "../src/ui/hermes-snapshot-collector";
import { fakeRunner, HERMES, HOME, JOBS_JSON, type Invocation } from "./remote-fixtures";

describe("round collection", () => {
  const profile = { alias: "m1-file", profileId: "default", home: HERMES };

  test("reads the cron listing and jobs.json for a selected source", async () => {
    const { runner, log } = fakeRunner([
      { match: "-mindepth 1 -maxdepth 1 -print0", stdout: `${HERMES}/cron/jobs.json\u0000${HERMES}/cron/executions.db\u0000` },
      { match: "cron/jobs.json", stdout: JOBS_JSON },
    ]);
    const collected = await collectSource(new SshReadOnlyAdapter({ runner }), profile, () => "2026-09-12T12:00:00Z");

    expect(collected.snapshot.sourceStatus).toBe("read");
    expect(collected.snapshot.jobs).toHaveLength(1);
    expect(collected.snapshot.lastUpdatedAt).toBe("2026-09-12T12:00:00Z");
    expect(collected.cronEntries).toContain(`${HERMES}/cron/executions.db`);

    // A round is O(profiles): R3 + R4 + R7 per source, and no output enumeration or body read.
    expect(log).toHaveLength(3);
    const commands = log.map((entry) => entry.args[entry.args.length - 1] ?? "");
    expect(commands.some((command) => command.includes("/output/"))).toBe(false);
    expect(commands.filter((command) => command.includes("sqlite3 -readonly -json"))).toHaveLength(1);
    // The ledger axis is refreshed every round, so a ledger that stops opening is visible in the
    // main view rather than only after a job detail is opened.
    expect(collected.ledger.status).not.toBe("read");
  });

  test("missing jobs.json degrades the source without failing the round", async () => {
    const { runner } = fakeRunner([{ match: "-print0", stdout: "" }]);
    const collected = await collectSource(new SshReadOnlyAdapter({ runner }), profile);
    expect(collected.snapshot.sourceStatus).toBe("file-missing");
    expect(collected.snapshot.jobs).toHaveLength(0);
  });

  test("unknown native fields surface as a schema mismatch", async () => {
    const { runner } = fakeRunner([
      { match: "-print0", stdout: `${HERMES}/cron/jobs.json\u0000` },
      { match: "cron/jobs.json", stdout: JSON.stringify({ jobs: [{ id: "a", brand_new_key: 1 }] }) },
    ]);
    const collected = await collectSource(new SshReadOnlyAdapter({ runner }), profile);
    expect(collected.snapshot.sourceStatus).toBe("schema-mismatch");
    expect(collected.snapshot.unparsedFields).toContain("brand_new_key");
  });

  test("one dead server does not stop the others and only selected sources are queried", async () => {
    const log: Invocation[] = [];
    const { runner } = fakeRunner(
      [
        { match: "printf", stdout: `${HOME}\n` },
        { match: "-print0", stdout: `${HERMES}/cron/jobs.json\u0000` },
        { match: "cron/jobs.json", stdout: JOBS_JSON },
      ],
      log,
    );
    const failing: RemoteRunner = async (file, args, options) => {
      log.push({ file, args });
      if ((args[args.length - 2] ?? "") === "dead") {
        return { stdout: "", stderr: "Operation timed out", exitCode: 255, capExceeded: false };
      }
      return runner(file, args, options);
    };

    const adapter = new SshReadOnlyAdapter({ runner: failing });
    const results = await collectRound(adapter, [
      { alias: "dead", profileId: "default", home: "/Users/x/.hermes" },
      { alias: "m1-file", profileId: "default", home: HERMES },
      { alias: "m1-file", profileId: "xia", home: `${HERMES}/profiles/xia` },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0]?.snapshot.transport).toBe("timeout");
    expect(results[1]?.snapshot.sourceStatus).toBe("read");
    expect(results[2]?.snapshot.sourceStatus).toBe("read");

    // Every issued command belongs to a selected alias.
    const aliases = new Set(log.map((entry) => entry.args[entry.args.length - 2] ?? ""));
    expect([...aliases].sort()).toEqual(["dead", "m1-file"]);
  });

  test("never issues more than one concurrent command per server", async () => {
    let inFlight = 0;
    let maxPerServer = 0;
    const runner: RemoteRunner = async (_file, args) => {
      const alias = args[args.length - 2] ?? "";
      if (alias === "m1-file") {
        inFlight += 1;
        maxPerServer = Math.max(maxPerServer, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      }
      const remoteCommand = args[args.length - 1] ?? "";
      if (remoteCommand.includes("jobs.json") && remoteCommand.startsWith("head")) {
        return { stdout: JOBS_JSON, stderr: "", exitCode: 0, capExceeded: false };
      }
      return { stdout: `${HERMES}/cron/jobs.json\u0000`, stderr: "", exitCode: 0, capExceeded: false };
    };

    await collectRound(new SshReadOnlyAdapter({ runner }), [
      { alias: "m1-file", profileId: "default", home: HERMES },
      { alias: "m1-file", profileId: "xia", home: `${HERMES}/profiles/xia` },
    ]);
    expect(maxPerServer).toBe(1);
  });
});
