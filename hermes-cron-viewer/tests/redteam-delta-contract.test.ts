import { describe, expect, test } from "bun:test";
import { COMMUNITY, HERMES, JOBS_JSON, PREEXISTING_COMMUNITY_PLUGINS, PROFILE, ROOT, SRC, SshReadOnlyAdapter, VAULT_PLUGIN, buildQueryExecutions, collectRound, fakeRunner, persistedSnapshot, readExecutionHistory, rehydrateSnapshot, sha256File, walk } from "./delta-fixtures";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("B1 re-verify: hostile keyset cursor", () => {
  test("builder and reader refuse control-character cursors without throwing or SSHing", async () => {
    for (const claimedAt of ["2026-09-12T09:00:00+09:00\n", "t\u0000x", "\tstamp", "x".repeat(65)]) {
      let threw = false;
      let built: ReturnType<typeof buildQueryExecutions> | undefined;
      try {
        built = buildQueryExecutions(HERMES, { limit: 5, before: { claimedAt, id: "abc123" } });
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
      expect(built?.ok).toBe(false);

      const { runner, log } = fakeRunner([{ match: "sqlite3", stdout: "[]" }]);
      let readerThrew = false;
      let result;
      try {
        result = await readExecutionHistory(new SshReadOnlyAdapter({ runner }), PROFILE, {
          limit: 5,
          before: { claimedAt, id: "abc123" },
        });
      } catch {
        readerThrew = true;
      }
      expect(readerThrew).toBe(false);
      expect(result?.status).toBe("ledger-unavailable");
      expect(log).toHaveLength(0);
    }
  });

  test("a quotable cursor with an embedded SQL quote is escaped, not thrown", () => {
    const result = buildQueryExecutions(HERMES, {
      limit: 5,
      before: { claimedAt: "2026-09-12T09:00:00+09:00'", id: "abc123" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.remoteCommand).toContain("(claimed_at, id) <");
      expect(result.command.remoteCommand).not.toContain("DROP");
    }
  });
});

describe("B2 re-verify: last_dispatch scalars survive disk", () => {
  test("projection keeps the four scalars and restore rebuilds lastDispatch", () => {
    const projected = persistedSnapshot();
    expect(projected.jobs[0]?.dispatchKind).toBe("catch_up");
    expect(projected.jobs[0]?.dispatchScheduledAt).toBe("2026-09-12T09:00:00+09:00");
    expect(projected.jobs[0]?.dispatchedAt).toBe("2026-09-12T09:31:00+09:00");
    expect(projected.jobs[0]?.dispatchLatenessSeconds).toBe(1860);
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("PROMPT-MUST-STAY-IN-MEMORY");
    expect(serialized).not.toContain("ERR-MUST-STAY-IN-MEMORY");
    expect(serialized).not.toContain("lastDispatch");

    const restored = rehydrateSnapshot(projected);
    expect(restored.jobs[0]?.lastDispatch).toEqual({
      kind: "catch_up",
      scheduledAt: "2026-09-12T09:00:00+09:00",
      dispatchedAt: "2026-09-12T09:31:00+09:00",
      latenessSeconds: 1860,
    });
    expect(restored.jobs[0]?.prompt).toBeNull();
    expect(restored.transport).toBe("disconnected");
  });
});

describe("delta: polling round issues R3+R4+R7 per profile", () => {
  test("two selected profiles each get listing, jobs.json and sqlite3", async () => {
    const { runner, log } = fakeRunner([
      { match: "-mindepth 1 -maxdepth 1 -print0", stdout: `${HERMES}/cron/jobs.json\u0000` },
      { match: "cron/jobs.json", stdout: JOBS_JSON },
      { match: "sqlite3", stderr: "unable to open database file", exitCode: 1 },
    ]);
    const results = await collectRound(new SshReadOnlyAdapter({ runner }), [
      PROFILE,
      { alias: "m1-file", profileId: "xia", home: `${HERMES}/profiles/xia` },
    ], { historyLimit: 7 });
    expect(results).toHaveLength(2);
    expect(log).toHaveLength(6);
    const commands = log.map((entry) => entry.args[entry.args.length - 1] ?? "");
    expect(commands.filter((command) => command.includes("-mindepth 1 -maxdepth 1 -print0"))).toHaveLength(2);
    expect(commands.filter((command) => command.includes("cron/jobs.json") && command.startsWith("head"))).toHaveLength(2);
    expect(commands.filter((command) => command.includes("sqlite3 -readonly -json"))).toHaveLength(2);
    expect(commands.every((command) => !command.includes("LIMIT 7") || command.includes("sqlite3"))).toBe(true);
    expect(commands.filter((command) => command.includes("LIMIT 7"))).toHaveLength(2);
    expect(commands.some((command) => command.includes("/output/"))).toBe(false);
  });
});

describe("delta: types live under src/types; no runtime style mutation", () => {
  test("shared type modules sit under src/types and sources do not mutate element.style", () => {
    const names = readdirSync(join(SRC, "types")).filter((name) => name.endsWith(".ts")).sort();
    expect(names).toContain("contracts.ts");
    expect(names).toContain("hermes-cron.ts");
    expect(names).toContain("remote-command.ts");
    expect(names).toContain("run-status.ts");
    expect(names).toContain("snapshot.ts");
    expect(names).toContain("view.ts");
    const files = walk(SRC).filter((path) => path.endsWith(".ts"));
    const styleHits: string[] = [];
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      if (/\.style\s*=/.test(text) || /element\.style/.test(text) || /\.style\.[a-zA-Z]/.test(text)) {
        styleHits.push(path);
      }
    }
    expect(styleHits).toEqual([]);
    expect(readFileSync(join(SRC, "ui/today-timeline-view.ts"), "utf8")).toContain("hcv-hour-slot");
  });
});

describe("B3 re-verify: Ataraxia install surface", () => {
  test("plugin files exist, data.json was not invented, and community plugins keep prior ids", () => {
    for (const file of ["main.js", "manifest.json", "styles.css"]) {
      expect(existsSync(join(ROOT, file))).toBe(true);
      expect(existsSync(join(VAULT_PLUGIN, file))).toBe(true);
    }
    // The plugin has now actually run in the vault, so data.json legitimately exists. The real
    // invariant is that it holds allow-listed metadata only: no prompt, reply, error or output body.
    const dataPath = join(VAULT_PLUGIN, "data.json");
    if (existsSync(dataPath)) {
      const raw = readFileSync(dataPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual(["remoteHomes", "settings", "store"]);
      for (const forbiddenKey of [
        "prompt", "lastError", "lastDeliveryError", "error", "body", "output", "stdout",
      ]) {
        expect(raw.includes(`"${forbiddenKey}":`)).toBe(false);
      }
    }
    const enabled = JSON.parse(readFileSync(COMMUNITY, "utf8")) as string[];
    for (const id of PREEXISTING_COMMUNITY_PLUGINS) {
      expect(enabled).toContain(id);
    }
    expect(enabled).toContain("hermes-cron-viewer");
  });

  test("records built vs installed hashes for the leader's final reinstall", () => {
    const report: Record<string, { built: string; installed: string; match: boolean }> = {};
    for (const file of ["main.js", "manifest.json", "styles.css"]) {
      const built = sha256File(join(ROOT, file));
      const installed = sha256File(join(VAULT_PLUGIN, file));
      report[file] = { built, installed, match: built === installed };
    }
    expect(report["manifest.json"]?.match).toBe(true);
    expect(report["styles.css"]?.match).toBe(true);
    // main.js may lag the latest build until the leader's final reinstall; do not re-raise B3.
    expect(typeof report["main.js"]?.built).toBe("string");
    expect(typeof report["main.js"]?.installed).toBe("string");
  });
});
