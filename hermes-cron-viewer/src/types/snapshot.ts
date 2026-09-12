import type { CronJobRecord, ExecutionRow, ProfileRef, SourceKey } from "./hermes-cron";
import type { SourceStatus, TransportStatus } from "./remote-command";

/** Live, in-memory view of one `(server, profile)` source after a collection round. */
export interface SourceSnapshot {
  readonly source: SourceKey;
  readonly home: string;
  readonly jobs: readonly CronJobRecord[];
  readonly transport: TransportStatus;
  readonly sourceStatus: SourceStatus;
  /** Reason text for a degraded status, e.g. why the ledger could not be queried. */
  readonly statusDetail: string | null;
  /** ISO instant of the last successful read for this source. */
  readonly lastUpdatedAt: string | null;
  readonly unparsedFields: readonly string[];
}

/** Ledger availability for one source. `rows` is empty whenever the axis is degraded. */
export interface LedgerReadResult {
  readonly status: SourceStatus;
  readonly detail: string | null;
  readonly rows: readonly ExecutionRow[];
  /** True when the query window was bounded, so an empty result is not "no history". */
  readonly windowLimited: boolean;
}

/** Freshness state kept per source so a disconnected server still shows its last content. */
export interface FreshnessState {
  readonly transport: TransportStatus;
  readonly sourceStatus: SourceStatus;
  readonly lastUpdatedAt: string | null;
  readonly stale: boolean;
  readonly detail: string | null;
}

export type FreshnessEvent =
  | { readonly kind: "success"; readonly at: string; readonly sourceStatus: SourceStatus; readonly detail: string | null }
  | { readonly kind: "failure"; readonly transport: TransportStatus; readonly detail: string | null };

/**
 * Allow-listed projection persisted under the vault config dir. Bodies (prompt, reply, error
 * text, output content) are structurally absent from this shape.
 */
export interface PersistedJob {
  readonly id: string;
  readonly name: string | null;
  readonly scheduleKind: string;
  readonly scheduleDisplay: string | null;
  readonly nextRunAt: string | null;
  readonly lastRunAt: string | null;
  readonly lastStatus: string;
  readonly state: string | null;
  readonly enabled: boolean | null;
  readonly failureStreak: number | null;
  readonly latestExecutionId: string | null;
  readonly latestExecutionStatus: string | null;
  /** The four allow-listed `last_dispatch` scalars; never the error detail. */
  readonly dispatchKind: string | null;
  readonly dispatchScheduledAt: string | null;
  readonly dispatchedAt: string | null;
  readonly dispatchLatenessSeconds: number | null;
}

export interface PersistedExecution {
  readonly id: string;
  readonly jobId: string;
  readonly status: string;
  readonly claimedAt: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly scheduledInstant: string | null;
  readonly runSource: string | null;
  readonly deliveryOutcome: string | null;
}

export interface PersistedSourceSnapshot {
  readonly alias: string;
  readonly profileId: string;
  readonly home: string;
  readonly jobs: readonly PersistedJob[];
  readonly executions: readonly PersistedExecution[];
  readonly outputFileNames: readonly string[];
  readonly transport: TransportStatus;
  readonly sourceStatus: SourceStatus;
  readonly lastUpdatedAt: string | null;
}

export interface PersistedStore {
  readonly version: 1;
  readonly snapshots: readonly PersistedSourceSnapshot[];
}

/** Settings persisted with the plugin. Contains no secrets and no remote bodies. */
export interface ViewerSettings {
  readonly servers: readonly string[];
  /** Selected `(alias, profileId)` sources, encoded as `alias\u0000profileId`. */
  readonly selectedSources: readonly string[];
  readonly autoRefreshSeconds: number;
  /** When false, job names are displayed but not written to disk. */
  readonly persistJobNames: boolean;
  readonly historyLimit: number;
}

export const DEFAULT_SETTINGS: ViewerSettings = {
  servers: [],
  selectedSources: [],
  autoRefreshSeconds: 60,
  persistJobNames: true,
  historyLimit: 50,
};

/** Discovery result for one server: candidate profiles the user may select. */
export interface DiscoveryResult {
  readonly alias: string;
  readonly transport: TransportStatus;
  readonly profiles: readonly ProfileRef[];
  readonly detail: string | null;
}

/** Memory-only body cache entry. Never persisted. */
export interface VerbatimEntry {
  readonly key: string;
  readonly body: string;
  readonly capExceeded: boolean;
  readonly bytes: number;
}

export function encodeSourceKey(key: SourceKey): string {
  return `${key.alias}\u0000${key.profileId}`;
}

export function decodeSourceKey(encoded: string): SourceKey {
  const [alias = "", profileId = ""] = encoded.split("\u0000");
  return { alias, profileId };
}

