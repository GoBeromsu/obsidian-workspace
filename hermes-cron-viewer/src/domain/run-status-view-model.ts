import type { CronJobRecord, ExecutionRow } from "../types/hermes-cron";
import type { ExecutionStatusView, JobStatusView, RunTally, StatusCell } from "../types/run-status";

const NO_INFO: StatusCell = { label: "No information", tally: "neither", raw: null };

/**
 * Map `jobs.json` status to the job-level columns.
 *
 * `delivery_failed` means the agent ran successfully but the result never reached the user, so it
 * is a delivery failure and NOT an execution failure. `delivery_queued` means completion is
 * unverified, which is neither success nor failure.
 */
export function jobStatusView(job: CronJobRecord): JobStatusView {
  const delivery: StatusCell = job.lastDeliveryUnverified
    ? { label: "Delivery unverified (adapter acked without a message id)", tally: "neither", raw: null }
    : NO_INFO;

  switch (job.lastStatus) {
    case "ok":
      return { execution: { label: "Succeeded", tally: "success", raw: null }, delivery };
    case "error":
      return { execution: { label: "Failed", tally: "failure", raw: null }, delivery };
    case "delivery_queued":
      return {
        execution: { label: "Completion unverified (do not resend)", tally: "neither", raw: null },
        delivery: { label: "Queued, completion unverified", tally: "neither", raw: null },
      };
    case "delivery_failed":
      return {
        execution: { label: "Succeeded", tally: "success", raw: null },
        delivery: { label: "Delivery failed", tally: "failure", raw: null },
      };
    case "unknown-value":
      return {
        execution: { label: "Unrecognized status", tally: "neither", raw: job.lastStatusRaw },
        delivery,
      };
    case "absent":
      return { execution: NO_INFO, delivery };
  }
}

/**
 * Map one ledger row to its columns.
 *
 * Delivery evidence comes from this row's own `delivery_outcome` only. A job-level signal such as
 * `last_delivery_unverified` describes the newest run and is never propagated onto an older row,
 * so changing the job's current state cannot rewrite history.
 */
export function executionStatusView(row: ExecutionRow): ExecutionStatusView {
  const delivery: StatusCell =
    row.deliveryOutcome === null || row.deliveryOutcome.trim() === ""
      ? NO_INFO
      : { label: row.deliveryOutcome, tally: "neither", raw: row.deliveryOutcome };

  switch (row.status) {
    case "claimed":
      return { execution: { label: "Claimed", tally: "neither", raw: null }, delivery };
    case "running":
      return { execution: { label: "Running", tally: "neither", raw: null }, delivery };
    case "completed":
      return { execution: { label: "Completed", tally: "success", raw: null }, delivery };
    case "failed":
      return { execution: { label: "Failed", tally: "failure", raw: null }, delivery };
    case "unknown":
      return {
        execution: { label: "Unknown (side effects unverified)", tally: "neither", raw: null },
        delivery,
      };
    case "unknown-value":
      return {
        execution: { label: "Unrecognized status", tally: "neither", raw: row.statusRaw },
        delivery,
      };
    case "absent":
      return { execution: NO_INFO, delivery };
  }
}

export function tallyExecutions(rows: readonly ExecutionRow[]): RunTally {
  let success = 0;
  let failure = 0;
  let neither = 0;
  for (const row of rows) {
    const { tally } = executionStatusView(row).execution;
    if (tally === "success") success += 1;
    else if (tally === "failure") failure += 1;
    else neither += 1;
  }
  return { success, failure, neither };
}
