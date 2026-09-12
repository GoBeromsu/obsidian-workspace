import type { OverviewInstant, OverviewInstantOptions } from "../types/contracts";
import { resolveInstant } from "./instant-timezone-resolver";

/**
 * Present one native timestamp for the overview facts.
 *
 * A value with an explicit offset is placed in local time: a prominent `HH:mm` clock plus a
 * secondary date and timezone line. A value without an offset is never placed, because that would
 * mean inventing a timezone; it is shown verbatim and labelled as such. Missing or malformed text
 * yields a neutral unavailable line, never an epoch-zero date. The exact stored text always stays
 * available through `raw`/`title`.
 */

const CLOCK_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  hourCycle: "h23",
};

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZoneName: "short",
};

const UNKNOWN_ZONE = "Time zone unknown";

function withZone(base: Intl.DateTimeFormatOptions, timeZone?: string): Intl.DateTimeFormatOptions {
  return timeZone === undefined ? base : { ...base, timeZone };
}

export function formatOverviewInstant(
  raw: string | null | undefined,
  options: OverviewInstantOptions = {},
): OverviewInstant {
  const unavailable = options.unavailable ?? "Not recorded";
  const resolved = resolveInstant(raw);

  if (resolved === null) {
    return { kind: "unavailable", clock: null, context: unavailable, raw: null, title: unavailable };
  }

  if (resolved.kind === "absolute") {
    const date = new Date(resolved.epochMs);
    const clock = new Intl.DateTimeFormat("en-US", withZone(CLOCK_OPTIONS, options.timeZone)).format(date);
    const context = new Intl.DateTimeFormat("en-US", withZone(DATE_OPTIONS, options.timeZone)).format(date);
    return { kind: "absolute", clock, context, raw: resolved.raw, title: resolved.raw };
  }

  // No offset, or a shape this build does not parse: show the stored text, claim no timezone.
  const context = resolved.kind === "timezone-unknown" ? UNKNOWN_ZONE : "Unrecognized time format";
  return {
    kind: "verbatim",
    clock: null,
    context,
    raw: resolved.raw,
    title: `${resolved.raw} — ${context}`,
  };
}
