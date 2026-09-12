import type { ProfileRef } from "../types/hermes-cron";
import type { LedgerReadResult, SourceSnapshot } from "../types/snapshot";
import type { SourceStatus } from "../types/remote-command";
import { buildListCronDirEntries, buildReadJobsJson } from "../domain/read-command-builder";
import { parseJobsJson } from "../domain/jobs-json-parser";
import { acceptStructuredJson, splitNulRecords } from "../domain/response-bound";
import type { SshReadOnlyAdapter } from "./ssh-read-only-adapter";
import { readExecutionHistory } from "./execution-history-reader";
import type { CollectedSource } from "../types/contracts";

function emptySnapshot(
  profile: ProfileRef,
  status: SourceStatus,
  detail: string | null,
  transport: SourceSnapshot["transport"],
): SourceSnapshot {
  return {
    source: { alias: profile.alias, profileId: profile.profileId },
    home: profile.home,
    jobs: [],
    transport,
    sourceStatus: status,
    statusDetail: detail,
    lastUpdatedAt: null,
    unparsedFields: [],
  };
}

/**
 * Read one selected source: the cron directory listing (R3) and `jobs.json` (R4).
 *
 * Output enumeration and bodies are deliberately absent - they are on-demand only, which keeps a
 * polling round linear in the number of profiles rather than the number of jobs.
 */
const LEDGER_NOT_ATTEMPTED: LedgerReadResult = {
  status: "ledger-unavailable",
  detail: "not attempted: the source could not be read this round",
  rows: [],
  windowLimited: false,
};

export async function collectSource(
  adapter: SshReadOnlyAdapter,
  profile: ProfileRef,
  now: () => string = () => new Date().toISOString(),
  historyLimit = 50,
): Promise<CollectedSource> {
  const listCommand = buildListCronDirEntries(profile.home);
  if (!listCommand.ok) {
    return {
      snapshot: emptySnapshot(profile, "parse-failed", listCommand.detail, "connected"),
      cronEntries: [],
      ledger: LEDGER_NOT_ATTEMPTED,
    };
  }
  const listing = await adapter.run(profile.alias, listCommand.command);
  if (listing.transport !== "connected") {
    return {
      snapshot: emptySnapshot(profile, "file-missing", listing.stderr.trim() || null, listing.transport),
      cronEntries: [],
      ledger: LEDGER_NOT_ATTEMPTED,
    };
  }
  const cronEntries = splitNulRecords(listing.stdout, listing.capExceeded);

  const jobsCommand = buildReadJobsJson(profile.home);
  if (!jobsCommand.ok) {
    return {
      snapshot: emptySnapshot(profile, "parse-failed", jobsCommand.detail, "connected"),
      cronEntries,
      ledger: LEDGER_NOT_ATTEMPTED,
    };
  }
  const jobsResult = await adapter.run(profile.alias, jobsCommand.command);
  if (jobsResult.transport !== "connected") {
    return {
      snapshot: emptySnapshot(profile, "file-missing", jobsResult.stderr.trim() || null, jobsResult.transport),
      cronEntries,
      ledger: LEDGER_NOT_ATTEMPTED,
    };
  }
  if (jobsResult.stdout.trim() === "") {
    const missing = !cronEntries.some((entry) => entry.endsWith("/jobs.json"));
    return {
      snapshot: emptySnapshot(
        profile,
        missing ? "file-missing" : "parse-failed",
        missing ? "cron/jobs.json is not present for this profile" : "cron/jobs.json was empty",
        "connected",
      ),
      cronEntries,
      ledger: LEDGER_NOT_ATTEMPTED,
    };
  }

  const accepted = acceptStructuredJson<unknown>(jobsResult.stdout, jobsResult.capExceeded);
  if (!accepted.ok) {
    return {
      snapshot: emptySnapshot(
        profile,
        accepted.reason === "cap-exceeded" ? "cap-exceeded" : "parse-failed",
        accepted.detail,
        "connected",
      ),
      cronEntries,
      ledger: LEDGER_NOT_ATTEMPTED,
    };
  }

  const source = { alias: profile.alias, profileId: profile.profileId };
  const parsed = parseJobsJson(source, accepted.value);
  const mismatch = !parsed.recognized || parsed.unparsedFields.length > 0;
  const detail = !parsed.recognized
    ? "cron/jobs.json does not match any known Hermes jobs shape"
    : parsed.unparsedFields.length > 0
      ? `${parsed.unparsedFields.length} native field(s) not interpreted by this build`
      : null;
  return {
    snapshot: {
      source,
      home: profile.home,
      jobs: parsed.jobs,
      transport: "connected",
      sourceStatus: mismatch ? "schema-mismatch" : "read",
      statusDetail: detail,
      lastUpdatedAt: now(),
      unparsedFields: parsed.unparsedFields,
    },
    cronEntries,
    // Refreshed per round so a ledger that stops opening is visible in the main view, not only
    // after a job detail is opened.
    ledger: await readExecutionHistory(adapter, profile, { limit: historyLimit }),
  };
}

/**
 * Collect every selected source with bounded concurrency.
 *
 * One in-flight command per server keeps a slow or dead host from blocking its siblings, and the
 * global cap keeps a round from fanning out across many servers at once. A failing source never
 * aborts the round.
 */
export async function collectRound(
  adapter: SshReadOnlyAdapter,
  profiles: readonly ProfileRef[],
  options: {
    readonly globalConcurrency?: number;
    readonly now?: () => string;
    readonly historyLimit?: number;
  } = {},
): Promise<readonly CollectedSource[]> {
  const globalConcurrency = Math.max(1, options.globalConcurrency ?? 2);
  const now = options.now ?? (() => new Date().toISOString());
  const results: CollectedSource[] = new Array(profiles.length);

  // Group by server so one alias is never queried concurrently, then run groups under the global
  // cap. Grouping keeps both limits structural instead of relying on a spin loop.
  const groups = new Map<string, { profile: ProfileRef; index: number }[]>();
  profiles.forEach((profile, index) => {
    const group = groups.get(profile.alias);
    if (group === undefined) groups.set(profile.alias, [{ profile, index }]);
    else group.push({ profile, index });
  });

  const pending = [...groups.values()];
  let nextGroup = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const group = pending[nextGroup];
      if (group === undefined) return;
      nextGroup += 1;
      for (const item of group) {
        results[item.index] = await collectSource(adapter, item.profile, now, options.historyLimit);
      }
    }
  }

  const workerCount = Math.min(globalConcurrency, Math.max(pending.length, 1));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
