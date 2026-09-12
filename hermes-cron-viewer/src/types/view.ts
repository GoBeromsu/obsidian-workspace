import type { CronJobRecord } from "./hermes-cron";

/** One native-stated instant placed on a day axis. */
export interface PlacedEntry {
  readonly job: CronJobRecord;
  /** Which native field stated this instant. */
  readonly origin: "next_run_at" | "last_run_at";
  readonly epochMs: number;
  readonly dayKey: string;
  readonly minutesOfDay: number;
  readonly localClock: string;
  /** Verbatim native value, shown next to the converted clock. */
  readonly raw: string;
}

/** An instant that exists natively but cannot be placed without inventing a timezone. */
export interface UnplacedEntry {
  readonly job: CronJobRecord;
  readonly origin: "next_run_at" | "last_run_at";
  readonly reason: "timezone-unknown" | "unparsed";
  readonly raw: string;
}

export interface PlacementResult {
  readonly placed: readonly PlacedEntry[];
  readonly unplaced: readonly UnplacedEntry[];
}

/** One slot a schedule rule would fire in, relative to the visible day list. */
export interface RuleSlot {
  readonly dayIndex: number;
  readonly minutesOfDay: number;
}

/** A parsed schedule rule projected onto the visible days. Never execution evidence. */
export interface ScheduleExpansion {
  /** Cadence text to show, taken from the native display string or the raw expression. */
  readonly cadence: string;
  /** Verbatim rule the slots were expanded from. */
  readonly rule: string;
  readonly slots: readonly RuleSlot[];
}

/**
 * One rule-derived chip inside a day-hour cell.
 *
 * `origin` is `"rule"` so it can never be confused with a Hermes-stated instant, and the shape
 * carries no status, duration or execution id.
 */
export interface RuleChip {
  readonly job: CronJobRecord;
  readonly origin: "rule";
  readonly cadence: string;
  readonly rule: string;
  /** Every projected clock this chip stands for, in order. */
  readonly clocks: readonly string[];
  /** `clocks.length`; greater than one only for a collapsed dense cadence. */
  readonly count: number;
  readonly collapsed: boolean;
}

/** One hour row of one day column: stated instants first, rule projections behind them. */
export interface HourCell {
  readonly hour: number;
  readonly entries: readonly PlacedEntry[];
  readonly ruleChips: readonly RuleChip[];
}

export interface DayColumn {
  readonly dayKey: string;
  readonly weekdayIndex: number;
  readonly isToday: boolean;
  readonly entries: readonly PlacedEntry[];
  /** Twenty-four hour cells, `hours[h]` covering `h:00`-`h:59`. */
  readonly hours: readonly HourCell[];
  /** Rule-derived occurrence count for this day, shown separately from stated instants. */
  readonly ruleCount: number;
}

export interface WeekGrid {
  readonly days: readonly DayColumn[];
  readonly unplaced: readonly UnplacedEntry[];
}

/** Server / profile / text filter applied to the collected snapshots. */
export interface ViewerFilter {
  readonly alias: string | null;
  /** Native profile name, or `null` for "any profile". */
  readonly profileId: string | null;
  readonly text: string;
}

/** The job detail sections; exactly one panel is rendered at a time. */
export type JobTabId = "overview" | "history" | "output";

/** Keyset cursor for "show more", mirroring the native `claimed_at DESC, id DESC` ordering. */
export interface HistoryCursor {
  readonly claimedAt: string;
  readonly id: string;
}

/** Injectable timer surface so polling behavior is testable without real time. */
export interface SchedulerClock {
  readonly setInterval: (handler: () => void, ms: number) => number;
  readonly clearInterval: (handle: number) => void;
}

/** Round-level counters. Bodies are never recorded, only shapes and classifications. */
export interface RoundCounters {
  sources: number;
  commands: number;
  durationMs: number;
  parseFailures: number;
  timezoneUnknown: number;
  ledgerUnavailable: number;
  capExceeded: number;
  rejectedCommands: number;
}
