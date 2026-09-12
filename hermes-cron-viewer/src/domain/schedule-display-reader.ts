import type { ScheduleInfo, ScheduleKind } from "../types/hermes-cron";
import { asRecord, asString } from "./json-scalars";

const KNOWN_KINDS: readonly ScheduleKind[] = ["once", "interval", "cron"];

/**
 * Read the schedule shape for display only.
 *
 * Deliberately does not expand a recurrence rule: native stores exactly one future instant
 * (`next_run_at`), so computing further occurrences would invent data the source never stated.
 */
export function readScheduleDisplay(
  schedule: unknown,
  scheduleDisplay: unknown,
): ScheduleInfo {
  const record = asRecord(schedule);
  const rawKind = asString(record?.["kind"]);
  const kind: ScheduleKind =
    rawKind !== null && (KNOWN_KINDS as readonly string[]).includes(rawKind)
      ? (rawKind as ScheduleKind)
      : "unknown";

  const raw =
    asString(record?.["expr"]) ??
    asString(record?.["run_at"]) ??
    asString(record?.["minutes"]) ??
    asString(record?.["value"]);

  const display = asString(scheduleDisplay) ?? asString(record?.["display"]) ?? raw;

  return { kind, display, raw };
}
