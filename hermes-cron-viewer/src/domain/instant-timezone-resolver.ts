import type { LocalParts, ResolvedInstant } from "../types/contracts";

/**
 * Decide whether a native timestamp has a determinable absolute instant.
 *
 * Hermes stores `hermes_time.now()` values that usually carry an offset, but legacy naive values
 * exist. A naive value cannot be placed on a calendar without inventing a timezone, so it is
 * reported as `timezone-unknown` and listed separately instead of being guessed.
 */

const OFFSET_RE = /(?:Z|[+-]\d{2}:?\d{2})$/;
const ISO_LIKE_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?/;

export function resolveInstant(raw: string | null | undefined): ResolvedInstant | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!ISO_LIKE_RE.test(trimmed)) return { kind: "unparsed", raw };
  if (!OFFSET_RE.test(trimmed)) return { kind: "timezone-unknown", raw };
  const epochMs = Date.parse(trimmed.replace(" ", "T"));
  if (Number.isNaN(epochMs)) return { kind: "unparsed", raw };
  return { kind: "absolute", epochMs, raw };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

export function toLocalParts(epochMs: number): LocalParts {
  const date = new Date(epochMs);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  return {
    year,
    month,
    day,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
    dayKey: `${pad(year, 4)}-${pad(month)}-${pad(day)}`,
  };
}

export function localDayKey(epochMs: number): string {
  return toLocalParts(epochMs).dayKey;
}

/** `HH:MM` in local time, for display next to the verbatim native value. */
export function localClock(epochMs: number): string {
  const { hour, minute } = toLocalParts(epochMs);
  return `${pad(hour)}:${pad(minute)}`;
}
