import { describe, expect, test } from "bun:test";
import { buildQueryExecutions } from "../src/domain/sqlite-select-builder";
import { projectSnapshot } from "../src/domain/snapshot-projection";
import { rehydrateSnapshot } from "../src/domain/snapshot-restore";
import { isUsableRead } from "../src/domain/read-usability";
import { HERMES } from "./remote-fixtures";

describe("consolidated review fixes", () => {
  test("a hostile keyset cursor is refused, never thrown", () => {
    for (const claimedAt of ["2026-09-12T09:00:00+09:00\u0000", "a\nb", "x".repeat(200)]) {
      const result = buildQueryExecutions(HERMES, {
        limit: 5,
        before: { claimedAt, id: "abc" },
      });
      expect(result.ok).toBe(false);
    }
    // A well-formed cursor still builds.
    expect(buildQueryExecutions(HERMES, {
      limit: 5,
      before: { claimedAt: "2026-09-12T09:00:00+09:00", id: "abc" },
    }).ok).toBe(true);
  });

  test("the allow-listed dispatch scalars survive a projection round trip", () => {
    const source = { alias: "m1-file", profileId: "default" };
    const snapshot = {
      source,
      home: HERMES,
      jobs: [{
        source, id: "j1", name: null, enabled: true, state: null,
        schedule: { kind: "cron" as const, display: null, raw: null },
        nextRunAt: null, lastRunAt: null, lastStatus: "ok" as const, lastStatusRaw: null,
        lastDeliveryUnverified: false, failureStreak: null,
        latestExecutionId: null, latestExecutionStatus: null,
        lastDispatch: { kind: "catch_up", scheduledAt: "s", dispatchedAt: "d", latenessSeconds: 60 },
        prompt: "body", lastError: "err", lastDeliveryError: null, unparsedFields: [],
      }],
      transport: "connected" as const,
      sourceStatus: "read" as const,
      statusDetail: null,
      lastUpdatedAt: "2026-09-12T12:00:00Z",
      unparsedFields: [],
    };

    const projected = projectSnapshot(snapshot, [], [], { persistJobNames: true });
    expect(projected.jobs[0]?.dispatchKind).toBe("catch_up");
    expect(projected.jobs[0]?.dispatchLatenessSeconds).toBe(60);
    // Bodies still never reach disk.
    expect(JSON.stringify(projected)).not.toContain("body");
    expect(JSON.stringify(projected)).not.toContain("err");

    const restored = rehydrateSnapshot(projected);
    expect(restored.jobs[0]?.lastDispatch?.kind).toBe("catch_up");
    expect(restored.jobs[0]?.prompt).toBeNull();
    // A restored source never claims a live connection.
    expect(restored.transport).toBe("disconnected");
  });
});

describe("usable-read gate", () => {
  const base = {
    source: { alias: "m1-file", profileId: "default" },
    home: HERMES,
    jobs: [],
    transport: "connected" as const,
    sourceStatus: "read" as const,
    statusDetail: null,
    lastUpdatedAt: "2026-09-12T12:00:00Z",
    unparsedFields: [],
  };

  test("only a usable round may replace the last good snapshot", () => {
    expect(isUsableRead(base)).toBe(true);
    // Connected but empty-handed: these must NOT overwrite previously read content.
    for (const status of ["file-missing", "parse-failed", "cap-exceeded", "ledger-missing"] as const) {
      expect(isUsableRead({ ...base, sourceStatus: status })).toBe(false);
    }
    // An unrecognized shape with no jobs is a failure; with jobs it is partially usable.
    expect(isUsableRead({ ...base, sourceStatus: "schema-mismatch" })).toBe(false);
    expect(isUsableRead({
      ...base,
      sourceStatus: "schema-mismatch",
      jobs: [{ id: "j" }] as never,
    })).toBe(true);
    // Transport failures are never usable regardless of the source status.
    expect(isUsableRead({ ...base, transport: "timeout" })).toBe(false);
  });
});
