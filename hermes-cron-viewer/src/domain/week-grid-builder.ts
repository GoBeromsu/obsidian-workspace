import type { CronJobRecord } from "../types/hermes-cron";
import { toLocalParts } from "./instant-timezone-resolver";
import type {
  DayColumn,
  HourCell,
  PlacedEntry,
  RuleChip,
  ScheduleExpansion,
  UnplacedEntry,
  WeekGrid,
} from "../types/view";
import { expandSchedule } from "./schedule-occurrences";
import { placeInstants } from "./timeline-placement";

/**
 * More than this many rule occurrences of the same job in one day-hour cell collapse into a
 * single cadence chip. Set to one so any repeated occurrence of the same job within an hour is
 * grouped: the chip keeps every projected clock and the exact count, so nothing is lost, it is
 * only shown once. Grouping never crosses jobs - chips are built per job record, so the same job
 * id seen under two source profiles stays two chips. Hermes-stated instants are never collapsed.
 */
export const RULE_COLLAPSE_THRESHOLD = 1;

function startOfLocalDay(epochMs: number): Date {
  const parts = toLocalParts(epochMs);
  return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
}

/**
 * Seven local day keys starting on `weekStartsOn` for the week containing `epochMs`.
 *
 * Days are advanced by calendar date rather than by adding 24h so a DST transition day still
 * produces exactly seven distinct keys.
 */
export function weekDayKeys(epochMs: number, weekStartsOn = 0): readonly string[] {
  const start = startOfLocalDay(epochMs);
  const offset = (start.getDay() - weekStartsOn + 7) % 7;
  start.setDate(start.getDate() - offset);
  const keys: string[] = [];
  for (let index = 0; index < 7; index += 1) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    keys.push(toLocalParts(day.getTime()).dayKey);
  }
  return keys;
}

function clockOf(minutesOfDay: number): string {
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

interface JobExpansion {
  readonly job: CronJobRecord;
  readonly expansion: ScheduleExpansion;
  /** Projected clocks keyed by `dayIndex * 24 + hour`. */
  readonly byCell: ReadonlyMap<number, readonly string[]>;
}

/** Expand every job whose rule parses confidently; unparsable rules contribute nothing. */
function expandJobs(jobs: readonly CronJobRecord[], dayKeys: readonly string[]): JobExpansion[] {
  const out: JobExpansion[] = [];
  for (const job of jobs) {
    // A disabled job's rule will not fire, so it contributes no projection. Its stated
    // `next_run_at` / `last_run_at` instants are untouched and still placed as entries.
    if (job.enabled === false) continue;
    const expansion = expandSchedule(job.schedule, dayKeys);
    if (expansion === null || expansion.slots.length === 0) continue;
    const byCell = new Map<number, string[]>();
    for (const slot of expansion.slots) {
      const key = slot.dayIndex * 24 + Math.floor(slot.minutesOfDay / 60);
      const bucket = byCell.get(key);
      if (bucket === undefined) byCell.set(key, [clockOf(slot.minutesOfDay)]);
      else bucket.push(clockOf(slot.minutesOfDay));
    }
    out.push({ job, expansion, byCell });
  }
  return out;
}

function hourCells(
  dayIndex: number,
  entries: readonly PlacedEntry[],
  expansions: readonly JobExpansion[],
): readonly HourCell[] {
  const cells: HourCell[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const ruleChips: RuleChip[] = [];
    for (const { job, expansion, byCell } of expansions) {
      const clocks = byCell.get(dayIndex * 24 + hour);
      if (clocks === undefined || clocks.length === 0) continue;
      const base = { job, origin: "rule" as const, cadence: expansion.cadence, rule: expansion.rule };
      if (clocks.length > RULE_COLLAPSE_THRESHOLD) {
        ruleChips.push({ ...base, clocks, count: clocks.length, collapsed: true });
      } else {
        for (const clock of clocks) {
          ruleChips.push({ ...base, clocks: [clock], count: 1, collapsed: false });
        }
      }
    }
    cells.push({
      hour,
      entries: entries.filter((entry) => Math.floor(entry.minutesOfDay / 60) === hour),
      ruleChips,
    });
  }
  return cells;
}

function ruleCountOf(dayIndex: number, expansions: readonly JobExpansion[]): number {
  let total = 0;
  for (const { expansion } of expansions) {
    for (const slot of expansion.slots) if (slot.dayIndex === dayIndex) total += 1;
  }
  return total;
}

/**
 * Build the weekly grid.
 *
 * `entries` stay exactly the instants Hermes stated; rule projections live in the hour cells under
 * the `"rule"` origin and are counted separately.
 */
export function buildWeekGrid(
  jobs: readonly CronJobRecord[],
  nowMs: number,
  weekStartsOn = 0,
): WeekGrid {
  const dayKeys = weekDayKeys(nowMs, weekStartsOn);
  const todayKey = toLocalParts(nowMs).dayKey;
  const { placed, unplaced } = placeInstants(jobs, dayKeys);

  const expansions = expandJobs(jobs, dayKeys);

  const days = dayKeys.map((dayKey, weekdayIndex) => {
    const entries = placed.filter((entry) => entry.dayKey === dayKey);
    return {
      dayKey,
      weekdayIndex,
      isToday: dayKey === todayKey,
      entries,
      hours: hourCells(weekdayIndex, entries, expansions),
      ruleCount: ruleCountOf(weekdayIndex, expansions),
    };
  });

  return { days, unplaced };
}

/** Today's single-column axis, used by the sidebar view. */
export function buildTodayColumn(jobs: readonly CronJobRecord[], nowMs: number): {
  readonly column: DayColumn;
  readonly unplaced: readonly UnplacedEntry[];
} {
  const dayKey = toLocalParts(nowMs).dayKey;
  const { placed, unplaced } = placeInstants(jobs, [dayKey]);
  return {
    column: {
      dayKey,
      weekdayIndex: new Date(nowMs).getDay(),
      isToday: true,
      entries: placed,
      hours: hourCells(0, placed, []),
      ruleCount: 0,
    },
    unplaced,
  };
}
