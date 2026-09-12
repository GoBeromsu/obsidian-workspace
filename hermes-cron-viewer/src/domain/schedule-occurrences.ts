import type { ScheduleInfo } from "../types/hermes-cron";
import type { RuleSlot, ScheduleExpansion } from "../types/view";

/**
 * Expand a job's schedule rule over the visible days.
 *
 * The result is a projection of the rule text only: it says when the rule would fire, never that
 * a run happened. Hermes states exactly one `next_run_at` and one `last_run_at`, and those stay
 * the only execution evidence. Anything this module cannot parse with certainty yields `null`,
 * so an unrecognized expression shows nothing instead of a guess.
 */

/** Upper bound on projected slots per job and week; denser rules are refused, not approximated. */
const MAX_SLOTS = 4032;

type FieldSet = ReadonlySet<number>;

function parseNumber(token: string, min: number, max: number): number | null {
  if (!/^\d{1,2}$/.test(token)) return null;
  const value = Number(token);
  return value >= min && value <= max ? value : null;
}

// One cron field: `*`, `a`, `a,b`, `a-b`, plus `/n` steps (`*/n`, `a-b/n`, `a/n`).
// Month and weekday names are deliberately not interpreted.
function parseField(field: string, min: number, max: number): FieldSet | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const pieces = part.split("/");
    if (pieces.length > 2) return null;
    const base = pieces[0];
    if (base === undefined || base === "") return null;
    let step = 1;
    if (pieces.length === 2) {
      const parsed = pieces[1] === undefined ? null : parseNumber(pieces[1], 1, 99);
      if (parsed === null) return null;
      step = parsed;
    }
    let low: number;
    let high: number;
    if (base === "*") {
      low = min;
      high = max;
    } else {
      const bounds = base.split("-");
      if (bounds.length > 2) return null;
      const first = bounds[0] === undefined ? null : parseNumber(bounds[0], min, max);
      if (first === null) return null;
      if (bounds.length === 1) {
        if (pieces.length === 1) {
          out.add(first);
          continue;
        }
        low = first;
        high = max;
      } else {
        const second = bounds[1] === undefined ? null : parseNumber(bounds[1], min, max);
        if (second === null || second < first) return null;
        low = first;
        high = second;
      }
    }
    for (let value = low; value <= high; value += step) out.add(value);
  }
  return out.size > 0 ? out : null;
}

/**
 * Local midnight for a `YYYY-MM-DD` key, or `null` when the key is not a real calendar date.
 * Impossible dates (`2025-02-30`, `2025-13-01`) are refused rather than rolled over, so a
 * malformed day axis can never silently shift a projection onto a different day.
 */
function localDate(dayKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Cron day selection: day-of-month and day-of-week are OR-ed when both are restricted, and
 * AND-ed with the unrestricted one otherwise, matching standard cron behavior.
 */
function matchesDay(
  date: Date,
  month: FieldSet,
  dom: FieldSet,
  dow: FieldSet,
  domRestricted: boolean,
  dowRestricted: boolean,
): boolean {
  if (!month.has(date.getMonth() + 1)) return false;
  const byDom = dom.has(date.getDate());
  const byDow = dow.has(date.getDay());
  if (!domRestricted && !dowRestricted) return true;
  if (!domRestricted) return byDow;
  if (!dowRestricted) return byDom;
  return byDom || byDow;
}

function cronSlots(expr: string, dayKeys: readonly string[]): readonly RuleSlot[] | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const minute = parseField(fields[0] ?? "", 0, 59);
  const hour = parseField(fields[1] ?? "", 0, 23);
  const dom = parseField(fields[2] ?? "", 1, 31);
  const month = parseField(fields[3] ?? "", 1, 12);
  const dowRaw = parseField(fields[4] ?? "", 0, 7);
  if (minute === null || hour === null || dom === null || month === null || dowRaw === null) {
    return null;
  }
  const dow = new Set([...dowRaw].map((value) => (value === 7 ? 0 : value)));
  const times: number[] = [];
  for (const h of hour) for (const m of minute) times.push(h * 60 + m);
  times.sort((a, b) => a - b);

  const domRestricted = (fields[2] ?? "").trim() !== "*";
  const dowRestricted = (fields[4] ?? "").trim() !== "*";
  const slots: RuleSlot[] = [];
  for (let dayIndex = 0; dayIndex < dayKeys.length; dayIndex += 1) {
    const date = localDate(dayKeys[dayIndex] ?? "");
    if (date === null) return null;
    if (!matchesDay(date, month, dom, dow, domRestricted, dowRestricted)) continue;
    if (slots.length + times.length > MAX_SLOTS) return null;
    for (const minutesOfDay of times) slots.push({ dayIndex, minutesOfDay });
  }
  return slots;
}

function textOf(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * Project `schedule` onto `dayKeys`.
 *
 * `null` means "not confidently expandable" - the caller must then show nothing derived. An empty
 * slot list means the rule is understood but fires on none of the visible days.
 */
export function expandSchedule(
  schedule: ScheduleInfo,
  dayKeys: readonly string[],
): ScheduleExpansion | null {
  const raw = textOf(schedule.raw);
  const display = textOf(schedule.display);
  const cadence = display ?? raw;
  if (cadence === null) return null;

  // Only cron carries the phase information a timed projection needs. An interval rule states a
  // period but no anchor, and Hermes exposes no authoritative start instant here, so projecting it
  // would require inventing a midnight origin - it is refused instead.
  if (schedule.kind !== "cron" || raw === null) return null;
  const slots = cronSlots(raw, dayKeys);
  const rule = raw;
  if (slots === null) return null;
  return { cadence, rule, slots };
}
