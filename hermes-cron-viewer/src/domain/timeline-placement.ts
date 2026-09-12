import type { CronJobRecord } from "../types/hermes-cron";
import type { PlacedEntry, PlacementResult, UnplacedEntry } from "../types/view";
import { localClock, localDayKey, resolveInstant, toLocalParts } from "./instant-timezone-resolver";

/**
 * Collect the instants native actually stated for a job.
 *
 * Exactly two per job at most: the single stored future occurrence and the last run. A recurrence
 * rule is never expanded - native stores one `next_run_at`, so projecting further occurrences
 * would display data the source never produced.
 */
function statedInstants(job: CronJobRecord): readonly { origin: PlacedEntry["origin"]; raw: string }[] {
  const out: { origin: PlacedEntry["origin"]; raw: string }[] = [];
  if (job.nextRunAt !== null && job.nextRunAt.trim() !== "") {
    out.push({ origin: "next_run_at", raw: job.nextRunAt });
  }
  if (job.lastRunAt !== null && job.lastRunAt.trim() !== "") {
    out.push({ origin: "last_run_at", raw: job.lastRunAt });
  }
  return out;
}

/** Stable ordering: by instant, then by job id so equal instants never reshuffle between rounds. */
function compareEntries(a: PlacedEntry, b: PlacedEntry): number {
  if (a.epochMs !== b.epochMs) return a.epochMs - b.epochMs;
  if (a.job.id !== b.job.id) return a.job.id < b.job.id ? -1 : 1;
  return a.origin < b.origin ? -1 : a.origin > b.origin ? 1 : 0;
}

/** Place every native-stated instant that falls in `dayKeys`, in the local timezone. */
export function placeInstants(
  jobs: readonly CronJobRecord[],
  dayKeys: readonly string[],
): PlacementResult {
  const wanted = new Set(dayKeys);
  const placed: PlacedEntry[] = [];
  const unplaced: UnplacedEntry[] = [];

  for (const job of jobs) {
    for (const stated of statedInstants(job)) {
      const resolved = resolveInstant(stated.raw);
      if (resolved === null) continue;
      if (resolved.kind !== "absolute") {
        unplaced.push({ job, origin: stated.origin, reason: resolved.kind, raw: stated.raw });
        continue;
      }
      const dayKey = localDayKey(resolved.epochMs);
      if (!wanted.has(dayKey)) continue;
      placed.push({
        job,
        origin: stated.origin,
        epochMs: resolved.epochMs,
        dayKey,
        minutesOfDay: toLocalParts(resolved.epochMs).minutesOfDay,
        localClock: localClock(resolved.epochMs),
        raw: stated.raw,
      });
    }
  }

  return { placed: placed.sort(compareEntries), unplaced };
}

