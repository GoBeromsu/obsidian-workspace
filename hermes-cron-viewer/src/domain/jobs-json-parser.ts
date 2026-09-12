import type { CronJobRecord, JobStatusToken, JobsReadResult, SourceKey } from "../types/hermes-cron";
import { asBoolean, asInteger, asRecord, asStrictString as asString } from "./json-scalars";
import { readScheduleDisplay } from "./schedule-display-reader";

const KNOWN_STATUS: readonly string[] = ["ok", "error", "delivery_queued", "delivery_failed"];

/** Keys this build reads into the record. */
const INTERPRETED_KEYS = [
  "id", "name", "enabled", "state", "schedule", "schedule_display", "next_run_at", "last_run_at",
  "last_status", "last_error", "last_delivery_error", "last_delivery_unverified", "failure_streak",
  "latest_execution", "prompt", "last_dispatch",
] as const;

/**
 * Native keys this build knows about but does not display.
 *
 * Kept separate from the interpreted set so `unparsedFields` means "this build has never seen this
 * key" rather than "this build does not render it". Without the distinction a healthy deployment
 * reports a permanent schema mismatch.
 */
const RECOGNIZED_KEYS = [
  "attach_to_session", "base_url", "context_from", "created_at", "deliver", "delivery_error",
  "enabled_toolsets", "failure_deliver", "fire_claim", "last_success_at", "last_verified_at",
  "last_verified_note", "model", "model_snapshot", "monitor_script", "monitor_state",
  "monitor_url", "no_agent", "origin", "paused_at", "paused_reason", "preflight_alerted",
  "profile", "provider", "provider_snapshot", "reasoning_effort", "repeat", "run_claim",
  "script", "skill", "skills", "updated_at", "workdir", "continuity", "last_fire_error",
] as const;

const KNOWN_KEYS = new Set<string>([...INTERPRETED_KEYS, ...RECOGNIZED_KEYS]);

function readStatus(value: unknown): { token: JobStatusToken; raw: string | null } {
  if (value === undefined || value === null) return { token: "absent", raw: null };
  const text = asString(value);
  if (text === null) return { token: "unknown-value", raw: String(value) };
  if (KNOWN_STATUS.includes(text)) return { token: text as JobStatusToken, raw: null };
  return { token: "unknown-value", raw: text };
}

/** Locate the job container, reporting whether the document shape was recognizable at all. */
function toJobRows(parsed: unknown): { rows: readonly unknown[]; recognized: boolean } {
  if (Array.isArray(parsed)) return { rows: parsed, recognized: true };
  const root = asRecord(parsed);
  if (root === null) return { rows: [], recognized: false };
  const jobs = root["jobs"];
  if (Array.isArray(jobs)) return { rows: jobs, recognized: true };
  const jobMap = asRecord(jobs);
  if (jobMap !== null) return { rows: Object.values(jobMap), recognized: true };
  return { rows: [], recognized: false };
}

function parseJob(source: SourceKey, row: unknown, unparsed: Set<string>): CronJobRecord | null {
  const record = asRecord(row);
  if (record === null) return null;
  const id = asString(record["id"]);
  if (id === null || id === "") return null;

  for (const key of Object.keys(record)) {
    if (!KNOWN_KEYS.has(key)) unparsed.add(key);
  }

  const status = readStatus(record["last_status"]);
  const latest = asRecord(record["latest_execution"]);
  const dispatch = asRecord(record["last_dispatch"]);

  return {
    source,
    id,
    name: asString(record["name"]),
    enabled: asBoolean(record["enabled"]),
    state: asString(record["state"]),
    schedule: readScheduleDisplay(record["schedule"], record["schedule_display"]),
    nextRunAt: asString(record["next_run_at"]),
    lastRunAt: asString(record["last_run_at"]),
    lastStatus: status.token,
    lastStatusRaw: status.raw,
    lastDeliveryUnverified: record["last_delivery_unverified"] !== undefined
      && record["last_delivery_unverified"] !== null
      && record["last_delivery_unverified"] !== false,
    failureStreak: asInteger(record["failure_streak"]),
    latestExecutionId: asString(latest?.["id"]),
    latestExecutionStatus: asString(latest?.["status"]),
    lastDispatch: dispatch === null ? null : {
      kind: asString(dispatch["kind"]),
      scheduledAt: asString(dispatch["scheduled_at"]),
      dispatchedAt: asString(dispatch["dispatched_at"]),
      latenessSeconds: asInteger(dispatch["lateness_seconds"]),
    },
    prompt: asString(record["prompt"]),
    lastError: asString(record["last_error"]),
    lastDeliveryError: asString(record["last_delivery_error"]),
    unparsedFields: [],
  };
}

/**
 * Parse a complete `jobs.json` document.
 *
 * Tolerant by design: a missing or unknown field never throws, and unknown keys are surfaced so a
 * schema mismatch shows up in the UI instead of silently blanking the view.
 */
export function parseJobsJson(source: SourceKey, parsed: unknown): JobsReadResult {
  const unparsed = new Set<string>();
  const jobs: CronJobRecord[] = [];
  const { rows, recognized } = toJobRows(parsed);
  for (const row of rows) {
    const job = parseJob(source, row, unparsed);
    if (job !== null) jobs.push(job);
  }
  // Rows present but none parseable also means the shape changed under us.
  const shapeOk = recognized && (rows.length === 0 || jobs.length > 0);
  return { jobs, unparsedFields: [...unparsed].sort(), recognized: shapeOk };
}
