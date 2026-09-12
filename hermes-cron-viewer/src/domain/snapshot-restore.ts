import type { PersistedSourceSnapshot, SourceSnapshot } from "../types/snapshot";

/**
 * Rehydrate a persisted projection into the in-memory shape.
 *
 * Bodies are absent from the projection by construction, so a restored job carries none until the
 * next round. Status tokens are not restored either: a cached value must not be presented as the
 * current native state, so the source is explicitly marked as not yet refreshed.
 */
export function rehydrateSnapshot(snapshot: PersistedSourceSnapshot): SourceSnapshot {
  const source = { alias: snapshot.alias, profileId: snapshot.profileId };
  return {
    source,
    home: snapshot.home,
    jobs: snapshot.jobs.map((job) => ({
      source,
      id: job.id,
      name: job.name,
      enabled: job.enabled,
      state: job.state,
      schedule: { kind: "unknown" as const, display: job.scheduleDisplay, raw: null },
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      lastStatus: "absent" as const,
      lastStatusRaw: null,
      lastDeliveryUnverified: false,
      failureStreak: job.failureStreak,
      latestExecutionId: job.latestExecutionId,
      latestExecutionStatus: job.latestExecutionStatus,
      lastDispatch:
        job.dispatchKind === null
        && job.dispatchScheduledAt === null
        && job.dispatchedAt === null
        && job.dispatchLatenessSeconds === null
          ? null
          : {
              kind: job.dispatchKind,
              scheduledAt: job.dispatchScheduledAt,
              dispatchedAt: job.dispatchedAt,
              latenessSeconds: job.dispatchLatenessSeconds,
            },
      prompt: null,
      lastError: null,
      lastDeliveryError: null,
      unparsedFields: [],
    })),
    // Never replay a cached `connected`: nothing has been read in this session yet.
    transport: "disconnected",
    sourceStatus: snapshot.sourceStatus,
    statusDetail: "Restored from cache; not yet refreshed in this session.",
    lastUpdatedAt: snapshot.lastUpdatedAt,
    unparsedFields: [],
  };
}
