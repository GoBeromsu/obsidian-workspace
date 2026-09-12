import { describe, expect, test } from "bun:test";
import { HERMES, HOME, HermesCronViewerPlugin, JOBS_JSON, Logger, PluginDataGateway, SETTINGS, SnapshotDiskStore, SourceStatusTracker, SshReadOnlyAdapter, ViewerState, gatewayFor, isUsableRead, job, persistedSnapshot, rehydrateSnapshot } from "./delta-fixtures";
import type { PersistedSourceSnapshot, RemoteRunner } from "./delta-fixtures";

describe("delta: failed source retains last successful content", () => {
  test("timeout and connected-but-unusable rounds keep jobs; only usable reads persist", async () => {
    let mode: "ok" | "fail" | "empty" = "ok";
    const persistCalls: PersistedSourceSnapshot[][] = [];
    const runner: RemoteRunner = async (_file, args) => {
      if (mode === "fail") {
        return { stdout: "", stderr: "Operation timed out", exitCode: 255, capExceeded: false };
      }
      const remote = args[args.length - 1] ?? "";
      if (remote.includes("-mindepth 1 -maxdepth 1 -print0")) {
        return { stdout: `${HERMES}/cron/jobs.json\u0000`, stderr: "", exitCode: 0, capExceeded: false };
      }
      if (remote.includes("cron/jobs.json") && remote.startsWith("head")) {
        if (mode === "empty") {
          return { stdout: "", stderr: "", exitCode: 0, capExceeded: false };
        }
        return { stdout: JOBS_JSON, stderr: "", exitCode: 0, capExceeded: false };
      }
      if (remote.includes("sqlite3")) {
        return {
          stdout: "",
          stderr: "Error: in prepare, unable to open database file (14)",
          exitCode: 1,
          capExceeded: false,
        };
      }
      return { stdout: "", stderr: "no such file or directory", exitCode: 1, capExceeded: false };
    };

    const state = new ViewerState(new SshReadOnlyAdapter({ runner }), SETTINGS, new Logger());
    state.rememberHome("m1-file", HOME);
    state.setPersistSink(async (snapshots) => {
      persistCalls.push([...snapshots]);
    });

    await state.refresh();
    expect(state.getSnapshots()[0]?.jobs).toHaveLength(1);
    expect(isUsableRead(state.getSnapshots()[0]!)).toBe(true);
    expect(persistCalls[0]).toHaveLength(1);

    mode = "fail";
    await state.refresh();
    expect(state.getSnapshots()[0]?.jobs[0]?.id).toBe("job-a");
    expect(state.getSnapshots()[0]?.transport).toBe("timeout");
    expect(persistCalls[1]).toEqual([]);

    mode = "empty";
    await state.refresh();
    expect(state.getSnapshots()[0]?.jobs[0]?.id).toBe("job-a");
    expect(state.getSnapshots()[0]?.sourceStatus).toBe("parse-failed");
    expect(persistCalls[2]).toEqual([]);
  });
});

describe("delta: settings persist must not delete the snapshot store", () => {
  test("saveSettings merge keeps an existing store", async () => {
    const snapshot = persistedSnapshot();
    let data: Record<string, unknown> = {
      settings: SETTINGS,
      remoteHomes: { "m1-file": HOME },
      store: { version: 1, snapshots: [snapshot] },
    };
    const plugin = new HermesCronViewerPlugin({ workspace: {} } as never, { id: "hermes-cron-viewer" } as never);
    plugin.loadData = async () => data;
    plugin.saveData = async (next: unknown) => {
      data = next as Record<string, unknown>;
    };
    await plugin.onload();
    await plugin.saveSettings({ ...SETTINGS, persistJobNames: false });
    const store = data.store as { snapshots: PersistedSourceSnapshot[] };
    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0]?.jobs[0]?.dispatchKind).toBe("catch_up");
  });

  test("SnapshotDiskStore.save([]) does not wipe unrelated snapshots", async () => {
    const snapshot = persistedSnapshot();
    const data = { current: { store: { version: 1, snapshots: [snapshot] } } as Record<string, unknown> };
    const store = new SnapshotDiskStore(gatewayFor(data));
    await store.save([]);
    const kept = (data.current.store as { snapshots: PersistedSourceSnapshot[] }).snapshots;
    expect(kept).toHaveLength(1);
  });

  test("concurrent settings and snapshot writes both survive", async () => {
    const snapshot = persistedSnapshot();
    let stored: Record<string, unknown> = { settings: SETTINGS };
    let inflight = 0;
    let maxInflight = 0;
    const plugin = {
      async loadData() {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inflight -= 1;
        return { ...stored };
      },
      async saveData(next: unknown) {
        stored = next as Record<string, unknown>;
      },
    };
    const gateway = new PluginDataGateway(plugin as never);
    const disk = new SnapshotDiskStore(gateway);
    await Promise.all([
      gateway.update<Record<string, unknown>>((current) => ({
        ...current,
        remoteHomes: { "m1-file": HOME },
      })),
      disk.save([snapshot]),
    ]);
    expect(maxInflight).toBe(1);
    expect((stored.remoteHomes as Record<string, string>)["m1-file"]).toBe(HOME);
    expect((stored.store as { snapshots: PersistedSourceSnapshot[] }).snapshots).toHaveLength(1);
  });
});

describe("delta: restored snapshots are disconnected and seeded stale", () => {
  test("restore marks disconnected, drops bodies, and freshness is stale", () => {
    const state = new ViewerState(
      new SshReadOnlyAdapter({ runner: async () => ({ stdout: "", stderr: "", exitCode: 0, capExceeded: false }) }),
      SETTINGS,
      new Logger(),
    );
    state.restore([persistedSnapshot()]);
    const restored = state.getSnapshots()[0];
    expect(restored?.transport).toBe("disconnected");
    expect(restored?.jobs[0]?.prompt).toBeNull();
    expect(restored?.jobs[0]?.lastDispatch?.kind).toBe("catch_up");
    const freshness = state.freshnessOf("m1-file\u0000default");
    expect(freshness.stale).toBe(true);
    expect(freshness.transport).toBe("disconnected");
    expect(freshness.lastUpdatedAt).toBe("2026-09-12T12:00:00Z");
  });

  test("seedRestored does not claim a live read", () => {
    const tracker = new SourceStatusTracker();
    tracker.seedRestored(rehydrateSnapshot(persistedSnapshot()));
    const state = tracker.freshnessOf("m1-file\u0000default");
    expect(state.stale).toBe(true);
    expect(state.transport).toBe("disconnected");
  });
});
