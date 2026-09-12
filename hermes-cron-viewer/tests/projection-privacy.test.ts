import { describe, expect, test } from "bun:test";
import type { CronJobRecord, ExecutionRow, SourceKey } from "../src/types/hermes-cron";
import type { SchedulerClock } from "../src/types/view";
import type { SourceSnapshot } from "../src/types/snapshot";
import { INITIAL_FRESHNESS, freshnessSummary, reduceFreshness } from "../src/domain/freshness-reducer";
import { PROJECTION_LIMITS, projectSnapshot } from "../src/domain/snapshot-projection";
import { RefreshScheduler } from "../src/ui/refresh-scheduler";
import { Logger } from "../src/utils/logger";

const SOURCE: SourceKey = { alias: "m1-file", profileId: "default" };
const SENTINEL = "SENTINEL-BODY-9f3a1c";

/** Fake clock so polling behavior is asserted without real time. */
function fakeClock(): { clock: SchedulerClock; fire: () => void; handles: number } {
  let nextHandle = 1;
  const handlers = new Map<number, () => void>();
  return {
    clock: {
      setInterval: (handler) => {
        const handle = nextHandle++;
        handlers.set(handle, handler);
        return handle;
      },
      clearInterval: (handle) => {
        handlers.delete(handle);
      },
    },
    fire: () => {
      for (const handler of [...handlers.values()]) handler();
    },
    get handles() {
      return handlers.size;
    },
  };
}

function job(overrides: Partial<CronJobRecord> = {}): CronJobRecord {
  return {
    source: SOURCE,
    id: "job-a",
    name: `name ${SENTINEL}`,
    enabled: true,
    state: "active",
    schedule: { kind: "cron", display: `display ${SENTINEL}`, raw: "0 9 * * *" },
    nextRunAt: "2026-09-13T09:00:00+09:00",
    lastRunAt: "2026-09-12T09:00:00+09:00",
    lastStatus: "error",
    lastStatusRaw: null,
    lastDeliveryUnverified: true,
    failureStreak: 2,
    latestExecutionId: "exec-1",
    latestExecutionStatus: "failed",
    lastDispatch: { kind: "late", scheduledAt: "s", dispatchedAt: "d", latenessSeconds: 10 },
    prompt: `prompt ${SENTINEL}`,
    lastError: `error ${SENTINEL}`,
    lastDeliveryError: `delivery ${SENTINEL}`,
    unparsedFields: [],
    ...overrides,
  };
}

function snapshot(jobs: readonly CronJobRecord[]): SourceSnapshot {
  return {
    source: SOURCE,
    home: "/Users/beomsu/.hermes",
    jobs,
    transport: "connected",
    sourceStatus: "read",
    statusDetail: null,
    lastUpdatedAt: "2026-09-12T12:00:00Z",
    unparsedFields: [],
  };
}

function executionRow(): ExecutionRow {
  return {
    source: SOURCE,
    id: "exec-1",
    jobId: "job-a",
    status: "failed",
    statusRaw: null,
    claimedAt: "2026-09-12T09:00:00+09:00",
    startedAt: null,
    finishedAt: null,
    scheduledInstant: null,
    runSource: "ticker",
    deliveryOutcome: "failed",
    error: `row error ${SENTINEL}`,
  };
}

describe("snapshot projection", () => {
  test("no body reaches disk at any nesting depth", () => {
    const projected = projectSnapshot(
      snapshot([job()]),
      [executionRow()],
      ["2026-09-12_09-00-21.md"],
      { persistJobNames: true },
    );

    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain(`prompt ${SENTINEL}`);
    expect(serialized).not.toContain(`error ${SENTINEL}`);
    expect(serialized).not.toContain(`delivery ${SENTINEL}`);
    expect(serialized).not.toContain(`row error ${SENTINEL}`);

    // Deep scan for the forbidden keys themselves, not just their values.
    const forbidden = ["prompt", "lastError", "lastDeliveryError", "error", "lastDispatch"];
    const seen: string[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (typeof value !== "object" || value === null) return;
      for (const [key, child] of Object.entries(value)) {
        if (forbidden.includes(key)) seen.push(key);
        walk(child);
      }
    };
    walk(projected);
    expect(seen).toEqual([]);
  });

  test("job names are dropped when the user opts out", () => {
    const projected = projectSnapshot(snapshot([job()]), [], [], { persistJobNames: false });
    expect(JSON.stringify(projected)).not.toContain(SENTINEL);
    expect(projected.jobs[0]?.id).toBe("job-a");
    expect(projected.jobs[0]?.name).toBeNull();
  });

  test("bounded by explicit caps", () => {
    const many = Array.from({ length: PROJECTION_LIMITS.jobs + 25 }, (_, index) =>
      job({ id: `job-${index}` }),
    );
    const rows = Array.from({ length: PROJECTION_LIMITS.executions + 10 }, () => executionRow());
    const names = Array.from({ length: PROJECTION_LIMITS.outputFileNames + 10 }, (_, i) => `${i}.md`);
    const projected = projectSnapshot(snapshot(many), rows, names, { persistJobNames: true });
    expect(projected.jobs).toHaveLength(PROJECTION_LIMITS.jobs);
    expect(projected.executions).toHaveLength(PROJECTION_LIMITS.executions);
    expect(projected.outputFileNames).toHaveLength(PROJECTION_LIMITS.outputFileNames);
  });
});

describe("logger privacy", () => {
  test("round logging records shapes, never bodies", () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (line: unknown) => void lines.push(String(line));
    try {
      new Logger().round({
        sources: 2,
        commands: 4,
        durationMs: 120,
        parseFailures: 0,
        timezoneUnknown: 1,
        ledgerUnavailable: 2,
        capExceeded: 0,
        rejectedCommands: 0,
      });
    } finally {
      console.log = original;
    }
    expect(lines.join("\n")).toContain("sources=2");
    expect(lines.join("\n")).not.toContain(SENTINEL);
  });
});
