import { describe, expect, test } from "bun:test";
import type { CronJobRecord, ExecutionRow, SourceKey } from "../src/types/hermes-cron";
import {
  executionStatusView,
  jobStatusView,
  tallyExecutions,
} from "../src/domain/run-status-view-model";
import { SshReadOnlyAdapter } from "../src/ui/ssh-read-only-adapter";
import { readExecutionHistory } from "../src/ui/execution-history-reader";
import { collectSource } from "../src/ui/hermes-snapshot-collector";
import { fakeRunner, HERMES, JOBS_JSON } from "./remote-fixtures";
import { projectSnapshot } from "../src/domain/snapshot-projection";
import type { SourceSnapshot } from "../src/types/snapshot";

const SOURCE: SourceKey = { alias: "m1-file", profileId: "default" };
const PROFILE = { alias: "m1-file", profileId: "default", home: HERMES };

function job(overrides: Partial<CronJobRecord> = {}): CronJobRecord {
  return {
    source: SOURCE,
    id: "job-a",
    name: "job-a",
    enabled: true,
    state: null,
    schedule: { kind: "cron", display: null, raw: null },
    nextRunAt: null,
    lastRunAt: null,
    lastStatus: "absent",
    lastStatusRaw: null,
    lastDeliveryUnverified: false,
    failureStreak: null,
    latestExecutionId: null,
    latestExecutionStatus: null,
    lastDispatch: null,
    prompt: null,
    lastError: null,
    lastDeliveryError: null,
    unparsedFields: [],
    ...overrides,
  };
}

function row(overrides: Partial<ExecutionRow> = {}): ExecutionRow {
  return {
    source: SOURCE,
    id: "exec-1",
    jobId: "job-a",
    status: "completed",
    statusRaw: null,
    claimedAt: "2026-09-12T09:00:00+09:00",
    startedAt: null,
    finishedAt: null,
    scheduledInstant: null,
    runSource: null,
    deliveryOutcome: null,
    error: null,
    ...overrides,
  };
}

describe("AC25 delivery evidence isolation", () => {
  test("job-level delivery signals never rewrite an older row's delivery or tally", () => {
    const older = row({ id: "E1", deliveryOutcome: null });
    const newer = row({ id: "E2", deliveryOutcome: "delivered" });
    const before = {
      older: executionStatusView(older),
      newer: executionStatusView(newer),
      tally: tallyExecutions([older, newer]),
    };

    for (const unverified of [false, true]) {
      for (const lastStatus of ["ok", "error", "delivery_failed", "delivery_queued"] as const) {
        const current = job({ lastStatus, lastDeliveryUnverified: unverified });
        expect(jobStatusView(current).delivery.label.length).toBeGreaterThan(0);
        expect(executionStatusView(older)).toEqual(before.older);
        expect(executionStatusView(newer)).toEqual(before.newer);
        expect(tallyExecutions([older, newer])).toEqual(before.tally);
      }
    }
  });
});

describe("AC24 / AC26 ledger failure modes", () => {
  test("error 14 degrades history once, with cause, and never falls back to hermes", async () => {
    const { runner, log } = fakeRunner([
      { match: "sqlite3", stderr: "Error: in prepare, unable to open database file (14)", exitCode: 1 },
    ]);
    const adapter = new SshReadOnlyAdapter({ runner });
    const first = await readExecutionHistory(adapter, PROFILE, { limit: 50 });
    const second = await readExecutionHistory(adapter, PROFILE, { limit: 50 });

    expect(first.status).toBe("ledger-unavailable");
    expect(first.detail).toContain("unable to open database file");
    expect(first.rows).toHaveLength(0);
    expect(second.status).toBe("ledger-unavailable");
    expect(log).toHaveLength(2);
    for (const entry of log) {
      const command = entry.args[entry.args.length - 1] ?? "";
      expect(command).toContain("sqlite3 -readonly -json");
      expect(command.startsWith("hermes")).toBe(false);
      expect(command).not.toContain("hermes cron");
      expect(command).not.toContain("immutable");
      expect(command).not.toContain("VACUUM");
      expect(command).not.toContain(".recover");
      expect(command).not.toContain("journal_mode");
    }
  });

  test("error 14 on the history axis leaves schedule collection working", async () => {
    const { runner, log } = fakeRunner([
      { match: "-mindepth 1 -maxdepth 1 -print0", stdout: `${HERMES}/cron/jobs.json\u0000` },
      { match: "cron/jobs.json", stdout: JOBS_JSON },
      { match: "sqlite3", stderr: "Error: in prepare, unable to open database file (14)", exitCode: 1 },
    ]);
    const collected = await collectSource(new SshReadOnlyAdapter({ runner }), PROFILE, () => "t");
    expect(collected.snapshot.sourceStatus).toBe("read");
    expect(collected.snapshot.jobs).toHaveLength(1);
    expect(collected.ledger.status).toBe("ledger-unavailable");
    expect(collected.ledger.detail).toContain("unable to open database file");
    const commands = log.map((entry) => entry.args[entry.args.length - 1] ?? "");
    expect(commands.some((command) => command.includes("hermes cron"))).toBe(false);
    expect(commands.filter((command) => command.includes("sqlite3"))).toHaveLength(1);
  });
});

describe("plan/code projection contract", () => {
  test("allow-listed last_dispatch scalars survive projection (plan §7)", () => {
    const snapshot: SourceSnapshot = {
      source: SOURCE,
      home: HERMES,
      jobs: [job({
        lastDispatch: {
          kind: "catch_up",
          scheduledAt: "2026-09-12T09:00:00+09:00",
          dispatchedAt: "2026-09-12T09:31:00+09:00",
          latenessSeconds: 1860,
        },
      })],
      transport: "connected",
      sourceStatus: "read",
      statusDetail: null,
      lastUpdatedAt: "t",
      unparsedFields: [],
    };
    const projected = projectSnapshot(snapshot, [], [], { persistJobNames: true });
    const serialized = JSON.stringify(projected);
    expect(serialized).toContain("catch_up");
    expect(serialized).toContain("1860");
  });
});
