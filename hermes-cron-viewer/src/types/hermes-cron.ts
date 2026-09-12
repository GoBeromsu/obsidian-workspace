/** One Hermes profile home discovered under a server. */
export interface ProfileRef {
  readonly alias: string;
  /** Native profile name. `default` is the profile served from the root `<home>/.hermes`. */
  readonly profileId: string;
  /** Absolute Hermes home, e.g. `/Users/x/.hermes` or `/Users/x/.hermes/profiles/xia`. */
  readonly home: string;
}

/** Composite key that keeps identical native ids from different sources apart. */
export interface SourceKey {
  readonly alias: string;
  readonly profileId: string;
}

export type ScheduleKind = "once" | "interval" | "cron" | "unknown";

export interface ScheduleInfo {
  readonly kind: ScheduleKind;
  /** Native display string when present, otherwise the raw expression. */
  readonly display: string | null;
  /** Raw native expression value, preserved verbatim. */
  readonly raw: string | null;
}

/** Native `last_status` vocabulary plus the two absent/unknown cases. */
export type JobStatusToken =
  | "ok"
  | "error"
  | "delivery_queued"
  | "delivery_failed"
  | "unknown-value"
  | "absent";

/** Native execution-ledger status vocabulary plus the two absent/unknown cases. */
export type LedgerStatusToken =
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "unknown"
  | "unknown-value"
  | "absent";

/** Native scheduled-vs-actual dispatch stamp, displayed exactly as stored. */
export interface DispatchStamp {
  readonly kind: string | null;
  readonly scheduledAt: string | null;
  readonly dispatchedAt: string | null;
  readonly latenessSeconds: number | null;
}

/**
 * One cron job as stored by native Hermes. Bodies (`prompt`, error text) are carried here for
 * in-memory display only and are stripped before any disk write.
 */
export interface CronJobRecord {
  readonly source: SourceKey;
  readonly id: string;
  readonly name: string | null;
  readonly enabled: boolean | null;
  readonly state: string | null;
  readonly schedule: ScheduleInfo;
  /** Native-stated next occurrence. Never derived or projected. */
  readonly nextRunAt: string | null;
  readonly lastRunAt: string | null;
  readonly lastStatus: JobStatusToken;
  /** Verbatim native value when `lastStatus` is `unknown-value`. */
  readonly lastStatusRaw: string | null;
  readonly lastDeliveryUnverified: boolean;
  readonly failureStreak: number | null;
  readonly latestExecutionId: string | null;
  readonly latestExecutionStatus: string | null;
  readonly lastDispatch: DispatchStamp | null;
  /** Memory-only body fields. */
  readonly prompt: string | null;
  readonly lastError: string | null;
  readonly lastDeliveryError: string | null;
  /** Native keys this build does not interpret, surfaced instead of silently dropped. */
  readonly unparsedFields: readonly string[];
}

/** One row of the native execution ledger. Delivery evidence never crosses row boundaries. */
export interface ExecutionRow {
  readonly source: SourceKey;
  readonly id: string;
  readonly jobId: string;
  readonly status: LedgerStatusToken;
  readonly statusRaw: string | null;
  readonly claimedAt: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly scheduledInstant: string | null;
  readonly runSource: string | null;
  /** This row's own delivery evidence. Never filled in from job-level signals. */
  readonly deliveryOutcome: string | null;
  /** Memory-only body field. */
  readonly error: string | null;
}

/** An output file listed under `cron/output/<job_id>/`, kept as separate evidence. */
export interface OutputFileRef {
  readonly source: SourceKey;
  readonly jobId: string;
  readonly fileName: string;
}

/** Enumeration result that keeps names failing the format contract countable but unusable. */
export interface OutputFileIndex {
  readonly files: readonly OutputFileRef[];
  /** Count of names rejected by the file-name contract. Reported, never used in a path. */
  readonly rejectedCount: number;
}

/** Result of reading `jobs.json` for one source. */
export interface JobsReadResult {
  readonly jobs: readonly CronJobRecord[];
  readonly unparsedFields: readonly string[];
  /** False when the document shape is not a recognizable Hermes jobs store. */
  readonly recognized: boolean;
}
