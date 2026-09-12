import { describe, expect, test } from "bun:test";
import {
  HERMES,
  HOME,
  HermesCronViewerPlugin,
  SETTINGS,
  persistedSnapshot,
} from "./delta-fixtures";
import type { PersistedSourceSnapshot, ViewerSettings } from "./delta-fixtures";

const OTHER_SNAPSHOT: PersistedSourceSnapshot = { ...persistedSnapshot(), alias: "keep-host" };

const START: ViewerSettings = {
  ...SETTINGS,
  servers: ["m1-file", "keep-host"],
  selectedSources: ["m1-file\u0000default", "keep-host\u0000default"],
  historyLimit: 42,
};

async function bootPlugin(): Promise<{
  plugin: InstanceType<typeof HermesCronViewerPlugin>;
  data: () => Record<string, unknown>;
}> {
  let data: Record<string, unknown> = {
    settings: START,
    remoteHomes: { "m1-file": HOME, "keep-host": HOME },
    store: { version: 1, snapshots: [persistedSnapshot(), OTHER_SNAPSHOT] },
  };
  const plugin = new HermesCronViewerPlugin(
    { workspace: {} } as never,
    { id: "hermes-cron-viewer" } as never,
  );
  plugin.loadData = async () => data;
  plugin.saveData = async (next: unknown) => {
    data = next as Record<string, unknown>;
  };
  await plugin.onload();
  return { plugin, data: () => data };
}

function snapshotsOf(data: Record<string, unknown>): PersistedSourceSnapshot[] {
  return (data.store as { snapshots: PersistedSourceSnapshot[] }).snapshots;
}

describe("connection target replacement", () => {
  test("replaces the target, preserves unrelated servers and settings", async () => {
    const { plugin, data } = await bootPlugin();

    const result = await plugin.replaceServerTarget("m1-file", "m2-file");

    expect(result).toEqual({ ok: true, changed: true });
    expect(plugin.settings.servers).toEqual(["m2-file", "keep-host"]);
    expect(plugin.settings.historyLimit).toBe(42);
    expect(plugin.settings.autoRefreshSeconds).toBe(SETTINGS.autoRefreshSeconds);
    expect((data().settings as ViewerSettings).servers).toEqual(["m2-file", "keep-host"]);
  });

  test("removes every stale binding of the old target and starts the new one unverified", async () => {
    const { plugin, data } = await bootPlugin();

    await plugin.replaceServerTarget("m1-file", "m2-file");

    expect(plugin.settings.selectedSources).toEqual(["keep-host\u0000default"]);
    expect(data().remoteHomes).toEqual({ "keep-host": HOME });
    expect(snapshotsOf(data()).map((snapshot) => snapshot.alias)).toEqual(["keep-host"]);
    // Unverified: no remembered home means the new target resolves to no selectable profile.
    expect(plugin.state.getRemoteHome("m2-file")).toBeUndefined();
    expect(plugin.state.selectedProfiles().map((profile) => profile.alias)).toEqual(["keep-host"]);
    expect(plugin.state.getSnapshots().map((snapshot) => snapshot.source.alias)).toEqual([
      "keep-host",
    ]);
    expect(plugin.state.getSnapshots()[0]?.home).toBe(HERMES);
  });

  test("duplicate target is rejected without mutating anything", async () => {
    const { plugin, data } = await bootPlugin();

    const result = await plugin.replaceServerTarget("m1-file", "keep-host");

    expect(result).toEqual({ ok: false, reason: "duplicate" });
    expect(plugin.settings.servers).toEqual(["m1-file", "keep-host"]);
    expect(plugin.settings.selectedSources).toEqual(START.selectedSources);
    expect(data().remoteHomes).toEqual({ "m1-file": HOME, "keep-host": HOME });
    expect(snapshotsOf(data())).toHaveLength(2);
  });

  test("invalid and unknown targets are rejected without mutating anything", async () => {
    const { plugin, data } = await bootPlugin();

    expect(await plugin.replaceServerTarget("m1-file", "-oProxyCommand=x")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await plugin.replaceServerTarget("m1-file", "bad host")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await plugin.replaceServerTarget("m1-file", "")).toEqual({ ok: false, reason: "invalid" });
    expect(await plugin.replaceServerTarget("ghost", "m2-file")).toEqual({
      ok: false,
      reason: "unknown",
    });
    expect(plugin.settings.servers).toEqual(["m1-file", "keep-host"]);
    expect(snapshotsOf(data())).toHaveLength(2);
  });

  test("unchanged target is a clean no-op that keeps selections and cache", async () => {
    const { plugin, data } = await bootPlugin();

    const result = await plugin.replaceServerTarget("m1-file", "m1-file");

    expect(result).toEqual({ ok: true, changed: false });
    expect(plugin.settings.servers).toEqual(["m1-file", "keep-host"]);
    expect(plugin.settings.selectedSources).toEqual(START.selectedSources);
    expect(data().remoteHomes).toEqual({ "m1-file": HOME, "keep-host": HOME });
    expect(snapshotsOf(data())).toHaveLength(2);
  });

  test("the plugin never writes to the filesystem or shells out to edit SSH config", async () => {
    const files = ["../src/main.ts", "../src/ui/connection-target-modal.ts"];
    // Documentation naming ~/.ssh/config is expected and allowed; only write capability is banned.
    const forbidden: readonly RegExp[] = [
      /\bfrom\s+["']node:fs/,
      /\brequire\(["'](node:)?fs["']\)/,
      /\bfrom\s+["']node:child_process/,
      /\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|rename|unlink|mkdir|chmod)\s*\(/,
      /\b(exec|execSync|execFile|execFileSync|spawn|spawnSync)\s*\(/,
      /\bBun\.write\s*\(/,
      /\b(vault|adapter)\.(write|append|create|modify)\b/,
    ];
    for (const file of files) {
      const text = await Bun.file(new URL(file, import.meta.url)).text();
      for (const pattern of forbidden) {
        expect({ file, pattern: pattern.source, matched: pattern.test(text) }).toEqual({
          file,
          pattern: pattern.source,
          matched: false,
        });
      }
      // The explanatory copy about SSH config is intentionally present in the modal.
      expect(text.includes("ssh -o")).toBe(false);
    }
  });
});
