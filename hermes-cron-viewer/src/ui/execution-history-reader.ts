import type { ProfileRef } from "../types/hermes-cron";
import type { LedgerReadResult } from "../types/snapshot";
import type { HistoryCursor } from "../types/view";
import { buildQueryExecutions } from "../domain/sqlite-select-builder";
import { parseExecutionRows } from "../domain/execution-row-parser";
import { acceptStructuredJson } from "../domain/response-bound";
import type { SshReadOnlyAdapter } from "./ssh-read-only-adapter";

function unavailable(detail: string, missing = false): LedgerReadResult {
  return {
    status: missing ? "ledger-missing" : "ledger-unavailable",
    detail,
    rows: [],
    windowLimited: false,
  };
}

/** Classify why `sqlite3` refused, without attempting any repair or workaround. */
function classifyLedgerFailure(stderr: string, exitCode: number | null): LedgerReadResult {
  const text = stderr.toLowerCase();
  if (exitCode === 127 || text.includes("command not found")) {
    return unavailable("sqlite3 is not available on the remote host");
  }
  if (text.includes("unable to open database file")) {
    return unavailable(
      "sqlite3 could not open the execution ledger read-only (unable to open database file)",
    );
  }
  if (text.includes("readonly") || text.includes("attempt to write")) {
    return unavailable("the execution ledger rejected a read-only connection");
  }
  if (text.includes("no such table")) {
    return unavailable("this Hermes build stores no executions table", true);
  }
  if (text.includes("unknown option") || text.includes("-json")) {
    return unavailable("this sqlite3 build does not support -json output");
  }
  if (text.includes("permission denied")) {
    return unavailable("permission denied reading the execution ledger");
  }
  return unavailable(stderr.trim() === "" ? "the execution ledger could not be read" : stderr.trim());
}

/**
 * Read one bounded page of the execution ledger.
 *
 * Every failure degrades to an explicit "no information" state with its cause. Nothing here
 * creates, repairs, checkpoints or rewrites remote state, and no CLI fallback is attempted: when
 * the ledger cannot be read, the schedule and output axes keep working on their own evidence.
 */
export async function readExecutionHistory(
  adapter: SshReadOnlyAdapter,
  profile: ProfileRef,
  options: { readonly jobId?: string; readonly limit: number; readonly before?: HistoryCursor },
): Promise<LedgerReadResult> {
  const command = buildQueryExecutions(profile.home, options);
  if (!command.ok) return unavailable(`${command.code}: ${command.detail}`);

  const outcome = await adapter.run(profile.alias, command.command);
  if (outcome.transport === "command-missing") {
    return unavailable("sqlite3 is not available on the remote host");
  }
  if (outcome.transport !== "connected") {
    return unavailable(`transport ${outcome.transport}`);
  }
  if ((outcome.exitCode ?? 0) !== 0 || outcome.stderr.trim() !== "") {
    return classifyLedgerFailure(outcome.stderr, outcome.exitCode);
  }
  if (outcome.stdout.trim() === "") {
    return { status: "read", detail: null, rows: [], windowLimited: true };
  }

  const accepted = acceptStructuredJson<unknown>(outcome.stdout, outcome.capExceeded);
  if (!accepted.ok) {
    return accepted.reason === "cap-exceeded"
      ? unavailable("the ledger response exceeded the response bound")
      : unavailable(`ledger output could not be parsed: ${accepted.detail}`);
  }

  const { rows, recognized } = parseExecutionRows(
    { alias: profile.alias, profileId: profile.profileId },
    accepted.value,
  );
  if (!recognized) {
    return unavailable("the execution ledger response did not match a known row shape");
  }
  return {
    status: "read",
    detail: null,
    rows,
    windowLimited: rows.length >= options.limit,
  };
}
