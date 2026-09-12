import { describe, expect, test } from "bun:test";
import type { CronJobRecord, ExecutionRow, SourceKey } from "../src/types/hermes-cron";
import { parseExecutionRows } from "../src/domain/execution-row-parser";
import { buildOutputFileIndex } from "../src/domain/output-file-index";
import {
  executionStatusView,
  jobStatusView,
  tallyExecutions,
} from "../src/domain/run-status-view-model";
import { SshReadOnlyAdapter } from "../src/ui/ssh-read-only-adapter";
import { readExecutionHistory } from "../src/ui/execution-history-reader";
import { VerbatimMemoryStore } from "../src/ui/verbatim-memory-store";
import { fakeRunner, HERMES } from "./remote-fixtures";
import { buildQueryExecutions } from "../src/domain/sqlite-select-builder";
import { projectSnapshot } from "../src/domain/snapshot-projection";
import { rehydrateSnapshot } from "../src/domain/snapshot-restore";

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

describe("job status mapping", () => {
  test("covers every native jobs.json token", () => {
    expect(jobStatusView(job({ lastStatus: "ok" })).execution.tally).toBe("success");
    expect(jobStatusView(job({ lastStatus: "error" })).execution.tally).toBe("failure");

    const queued = jobStatusView(job({ lastStatus: "delivery_queued" }));
    expect(queued.execution.tally).toBe("neither");
    expect(queued.execution.label).toContain("do not resend");

    // Agent ran fine; only delivery failed. It must not be counted as an execution failure.
    const deliveryFailed = jobStatusView(job({ lastStatus: "delivery_failed" }));
    expect(deliveryFailed.execution.tally).toBe("success");
    expect(deliveryFailed.delivery.tally).toBe("failure");

    const unknownValue = jobStatusView(job({ lastStatus: "unknown-value", lastStatusRaw: "teleported" }));
    expect(unknownValue.execution.tally).toBe("neither");
    expect(unknownValue.execution.raw).toBe("teleported");

    expect(jobStatusView(job({ lastStatus: "absent" })).execution.label).toBe("No information");

    const unverified = jobStatusView(job({ lastStatus: "ok", lastDeliveryUnverified: true }));
    expect(unverified.delivery.tally).toBe("neither");
    expect(unverified.delivery.label).toContain("unverified");
  });
});

describe("ledger status mapping", () => {
  test("covers every native ledger token and never counts unknown as failure", () => {
    expect(executionStatusView(row({ status: "claimed" })).execution.tally).toBe("neither");
    expect(executionStatusView(row({ status: "running" })).execution.tally).toBe("neither");
    expect(executionStatusView(row({ status: "completed" })).execution.tally).toBe("success");
    expect(executionStatusView(row({ status: "failed" })).execution.tally).toBe("failure");

    const unknown = executionStatusView(row({ status: "unknown" }));
    expect(unknown.execution.tally).toBe("neither");
    expect(unknown.execution.label).toContain("side effects unverified");

    const novel = executionStatusView(row({ status: "unknown-value", statusRaw: "warped" }));
    expect(novel.execution.raw).toBe("warped");

    const tally = tallyExecutions([
      row({ id: "1", status: "completed" }),
      row({ id: "2", status: "failed" }),
      row({ id: "3", status: "unknown" }),
      row({ id: "4", status: "running" }),
    ]);
    expect(tally).toEqual({ success: 1, failure: 1, neither: 2 });
  });
});

describe("delivery evidence isolation", () => {
  test("a job-level delivery signal never reaches a historical row", () => {
    const older = row({ id: "E1", deliveryOutcome: null });
    const newer = row({ id: "E2", deliveryOutcome: "delivered" });

    for (const unverified of [false, true]) {
      for (const lastStatus of ["ok", "delivery_failed", "delivery_queued"] as const) {
        const current = job({ lastStatus, lastDeliveryUnverified: unverified });
        // Job-level state changes across this loop...
        expect(jobStatusView(current).delivery.label).toBeString();
        // ...but each row keeps its own evidence and its own tally.
        expect(executionStatusView(older).delivery.label).toBe("No information");
        expect(executionStatusView(newer).delivery.label).toBe("delivered");
        expect(executionStatusView(older).execution.tally).toBe("success");
      }
    }
  });

  test("one row's delivery outcome does not leak into a sibling row", () => {
    const rows = [row({ id: "E1", deliveryOutcome: "delivered" }), row({ id: "E2" })];
    expect(executionStatusView(rows[0]!).delivery.label).toBe("delivered");
    expect(executionStatusView(rows[1]!).delivery.label).toBe("No information");
  });
});

describe("ledger reading", () => {
  test("parses -json rows and preserves bodies verbatim", () => {
    const { rows, recognized } = parseExecutionRows(SOURCE, [
      { id: "e1", job_id: "job-a", status: "failed", claimed_at: "t1", error: "line1\nline2 | pipe" },
      { id: "e2", job_id: "job-a", status: "weird" },
      { job_id: "no-id" },
    ]);
    expect(recognized).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.error).toBe("line1\nline2 | pipe");
    expect(rows[1]?.status).toBe("unknown-value");
    expect(rows[1]?.statusRaw).toBe("weird");
  });

  test("the observed error 14 degrades history with its cause and no repair attempt", async () => {
    const { runner, log } = fakeRunner([
      { match: "sqlite3", stderr: "Error: in prepare, unable to open database file (14)", exitCode: 1 },
    ]);
    const result = await readExecutionHistory(new SshReadOnlyAdapter({ runner }), PROFILE, { limit: 50 });

    expect(result.status).toBe("ledger-unavailable");
    expect(result.detail).toContain("unable to open database file");
    expect(result.rows).toHaveLength(0);

    // Exactly one attempt, no retry, no repair, no CLI fallback.
    expect(log).toHaveLength(1);
    const command = log[0]?.args[log[0].args.length - 1] ?? "";
    expect(command).toContain("sqlite3 -readonly -json");
    // The `.hermes` path is expected; invoking the `hermes` CLI is not.
    expect(command.startsWith("hermes ")).toBe(false);
    expect(command).not.toContain("hermes cron");
    expect(command).not.toContain("immutable");
  });

  test("classifies the other unavailable causes distinctly", async () => {
    const cases: readonly { stderr: string; exitCode: number; expected: string }[] = [
      { stderr: "zsh: command not found: sqlite3", exitCode: 127, expected: "not available" },
      { stderr: "Error: no such table: executions", exitCode: 1, expected: "no executions table" },
      { stderr: "Error: unknown option: -json", exitCode: 1, expected: "-json" },
      { stderr: "Error: permission denied", exitCode: 1, expected: "Permission denied" },
    ];
    for (const testCase of cases) {
      const { runner } = fakeRunner([
        { match: "sqlite3", stderr: testCase.stderr, exitCode: testCase.exitCode },
      ]);
      const result = await readExecutionHistory(new SshReadOnlyAdapter({ runner }), PROFILE, { limit: 5 });
      expect(result.rows).toHaveLength(0);
      expect(result.status === "ledger-unavailable" || result.status === "ledger-missing").toBe(true);
      expect((result.detail ?? "").toLowerCase()).toContain(testCase.expected.toLowerCase());
    }
  });

  test("an empty result is a window statement, not a claim that no history exists", async () => {
    const { runner } = fakeRunner([{ match: "sqlite3", stdout: "" }]);
    const result = await readExecutionHistory(new SshReadOnlyAdapter({ runner }), PROFILE, { limit: 5 });
    expect(result.status).toBe("read");
    expect(result.windowLimited).toBe(true);
  });
});

describe("output index", () => {
  test("keeps unsupported names countable but unusable, and never pairs with the ledger", () => {
    const directory = `${HERMES}/cron/output/job-a`;
    const index = buildOutputFileIndex(SOURCE, "job-a", directory, [
      `${directory}/2026-09-12T09:00:00.md`,
      `${directory}/2026-09-11T09:00:00.md`,
      `${directory}/weird name.md`,
      `${directory}/nested/inner.md`,
      "/etc/passwd",
    ]);

    expect(index.files.map((file) => file.fileName)).toEqual([
      "2026-09-12T09:00:00.md",
      "2026-09-11T09:00:00.md",
    ]);
    expect(index.rejectedCount).toBe(3);
    // The index carries no ledger identifier at all, so pairing is structurally impossible.
    expect(Object.keys(index.files[0] ?? {})).toEqual(["source", "jobId", "fileName"]);
  });
});

describe("verbatim memory store", () => {
  test("holds bodies in memory only and evicts under budget", () => {
    const store = new VerbatimMemoryStore(64);
    store.set("a", "x".repeat(40), false);
    store.set("b", "y".repeat(40), false);
    expect(store.has("a")).toBe(false);
    expect(store.get("b")?.body).toBe("y".repeat(40));

    store.clear();
    expect(store.sizeBytes).toBe(0);
    // A restart is modelled by a fresh store: nothing survives it.
    expect(new VerbatimMemoryStore().has("b")).toBe(false);
  });
});
