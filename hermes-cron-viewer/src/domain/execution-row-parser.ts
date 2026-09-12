import type { ExecutionRow, LedgerStatusToken, SourceKey } from "../types/hermes-cron";
import { asString } from "./json-scalars";

const KNOWN_STATUS: readonly string[] = ["claimed", "running", "completed", "failed", "unknown"];

function readStatus(value: unknown): { token: LedgerStatusToken; raw: string | null } {
  const text = asString(value);
  if (text === null) return { token: "absent", raw: null };
  if (KNOWN_STATUS.includes(text)) return { token: text as LedgerStatusToken, raw: null };
  return { token: "unknown-value", raw: text };
}

/**
 * Parse `sqlite3 -json` rows into execution records.
 *
 * Each row carries only its own evidence. No job-level signal is copied in, and no attempt is made
 * to associate a row with an output file: the native schema has no column linking the two.
 */
export function parseExecutionRows(
  source: SourceKey,
  parsed: unknown,
): { readonly rows: readonly ExecutionRow[]; readonly recognized: boolean } {
  if (!Array.isArray(parsed)) return { rows: [], recognized: false };
  const rows: ExecutionRow[] = [];

  for (const candidate of parsed) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const record = candidate as Record<string, unknown>;
    const id = asString(record["id"]);
    const jobId = asString(record["job_id"]);
    if (id === null || jobId === null) continue;
    const status = readStatus(record["status"]);

    rows.push({
      source,
      id,
      jobId,
      status: status.token,
      statusRaw: status.raw,
      claimedAt: asString(record["claimed_at"]),
      startedAt: asString(record["started_at"]),
      finishedAt: asString(record["finished_at"]),
      scheduledInstant: asString(record["scheduled_instant"]),
      runSource: asString(record["source"]),
      deliveryOutcome: asString(record["delivery_outcome"]),
      error: asString(record["error"]),
    });
  }

  // A non-empty response that yields no rows means the ledger shape is not what this build reads.
  return { rows, recognized: parsed.length === 0 || rows.length > 0 };
}
