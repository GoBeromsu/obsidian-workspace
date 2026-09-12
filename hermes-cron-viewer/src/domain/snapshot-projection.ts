import type { ExecutionRow } from "../types/hermes-cron";
import type { PersistedExecution, PersistedJob, PersistedSourceSnapshot, SourceSnapshot } from "../types/snapshot";
import type { ProjectionOptions } from "../types/contracts";

/** Hard caps so one source cannot grow the on-disk store without bound. */
export const PROJECTION_LIMITS = {
  jobs: 500,
  executions: 200,
  outputFileNames: 500,
} as const;

/**
 * Build the on-disk shape by ALLOW-LIST projection.
 *
 * Each field is copied explicitly into a fresh object, so a body field cannot reach disk even if a
 * future native version adds one: unknown input is dropped rather than filtered.
 */
export function projectSnapshot(
  snapshot: SourceSnapshot,
  executions: readonly ExecutionRow[],
  outputFileNames: readonly string[],
  options: ProjectionOptions,
): PersistedSourceSnapshot {
  const jobs: PersistedJob[] = snapshot.jobs.slice(0, PROJECTION_LIMITS.jobs).map((job) => ({
    id: job.id,
    name: options.persistJobNames ? job.name : null,
    scheduleKind: job.schedule.kind,
    scheduleDisplay: options.persistJobNames ? job.schedule.display : null,
    nextRunAt: job.nextRunAt,
    lastRunAt: job.lastRunAt,
    lastStatus: job.lastStatus,
    state: job.state,
    enabled: job.enabled,
    failureStreak: job.failureStreak,
    latestExecutionId: job.latestExecutionId,
    latestExecutionStatus: job.latestExecutionStatus,
    dispatchKind: job.lastDispatch?.kind ?? null,
    dispatchScheduledAt: job.lastDispatch?.scheduledAt ?? null,
    dispatchedAt: job.lastDispatch?.dispatchedAt ?? null,
    dispatchLatenessSeconds: job.lastDispatch?.latenessSeconds ?? null,
  }));

  const rows: PersistedExecution[] = executions
    .slice(0, PROJECTION_LIMITS.executions)
    .map((row) => ({
      id: row.id,
      jobId: row.jobId,
      status: row.status,
      claimedAt: row.claimedAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      scheduledInstant: row.scheduledInstant,
      runSource: row.runSource,
      deliveryOutcome: row.deliveryOutcome,
    }));

  return {
    alias: snapshot.source.alias,
    profileId: snapshot.source.profileId,
    home: snapshot.home,
    jobs,
    executions: rows,
    outputFileNames: outputFileNames.slice(0, PROJECTION_LIMITS.outputFileNames),
    transport: snapshot.transport,
    sourceStatus: snapshot.sourceStatus,
    lastUpdatedAt: snapshot.lastUpdatedAt,
  };
}

