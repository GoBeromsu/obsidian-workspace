import { describe, expect, test } from "bun:test";
import { expandSchedule } from "../src/domain/schedule-occurrences";
import type { ScheduleInfo } from "../src/types/hermes-cron";
import type { RuleSlot } from "../src/types/view";

/** 2025-03-02 (Sun) .. 2025-03-08 (Sat): a full week with a known weekday alignment. */
const WEEK = [
  "2025-03-02",
  "2025-03-03",
  "2025-03-04",
  "2025-03-05",
  "2025-03-06",
  "2025-03-07",
  "2025-03-08",
] as const;

function cron(raw: string, display: string | null = null): ScheduleInfo {
  return { kind: "cron", display, raw };
}

function interval(raw: string): ScheduleInfo {
  return { kind: "interval", display: null, raw };
}

function slotsOf(schedule: ScheduleInfo, days: readonly string[] = WEEK): readonly RuleSlot[] {
  const expansion = expandSchedule(schedule, days);
  if (expansion === null) throw new Error(`expected an expansion for ${String(schedule.raw)}`);
  return expansion.slots;
}

function dayIndexes(slots: readonly RuleSlot[]): readonly number[] {
  return [...new Set(slots.map((slot) => slot.dayIndex))];
}

describe("expandSchedule: daily cron over a week", () => {
  test("a daily rule fires once on every visible day at the stated minute", () => {
    const slots = slotsOf(cron("30 7 * * *"));
    expect(slots).toHaveLength(7);
    expect(dayIndexes(slots)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(new Set(slots.map((slot) => slot.minutesOfDay))).toEqual(new Set([7 * 60 + 30]));
  });

  test("the expansion echoes the rule and prefers the native display text as cadence", () => {
    const expansion = expandSchedule(cron("30 7 * * *", "매일 07:30"), WEEK);
    expect(expansion).not.toBeNull();
    expect(expansion?.rule).toBe("30 7 * * *");
    expect(expansion?.cadence).toBe("매일 07:30");
  });

  test("a rule that fires on none of the visible days expands to an empty slot list, not null", () => {
    const expansion = expandSchedule(cron("0 9 1 1 *"), WEEK);
    expect(expansion).not.toBeNull();
    expect(expansion?.slots).toHaveLength(0);
  });
});

describe("expandSchedule: weekday restrictions", () => {
  test("1-5 selects Monday..Friday of the visible week", () => {
    expect(dayIndexes(slotsOf(cron("0 9 * * 1-5")))).toEqual([1, 2, 3, 4, 5]);
  });

  test("Sunday is reachable as both 0 and 7", () => {
    expect(dayIndexes(slotsOf(cron("0 9 * * 0")))).toEqual([0]);
    expect(dayIndexes(slotsOf(cron("0 9 * * 7")))).toEqual([0]);
    // 0 and 7 name the same day, so listing both does not double the slots.
    expect(slotsOf(cron("0 9 * * 0,7"))).toHaveLength(1);
  });

  test("restricted day-of-month and day-of-week are OR-ed, as in standard cron", () => {
    // Mar 4 by day-of-month, plus every Saturday (Mar 8) by day-of-week.
    expect(dayIndexes(slotsOf(cron("0 9 4 * 6")))).toEqual([2, 6]);
  });

  test("an unrestricted day-of-week still AND-s with a restricted day-of-month", () => {
    expect(dayIndexes(slotsOf(cron("0 9 5 * *")))).toEqual([3]);
  });
});

describe("expandSchedule: lists, ranges and steps", () => {
  test("a minute list crossed with an hour range yields every combination, sorted per day", () => {
    const slots = slotsOf(cron("0,30 9-10 * * *"), [WEEK[0]]);
    expect(slots.map((slot) => slot.minutesOfDay)).toEqual([540, 570, 600, 630]);
  });

  test("a step over a range advances by the step", () => {
    const slots = slotsOf(cron("0-45/15 8 * * *"), [WEEK[0]]);
    expect(slots.map((slot) => slot.minutesOfDay)).toEqual([480, 495, 510, 525]);
  });

  test("a bare value with a step runs to the end of the field", () => {
    const slots = slotsOf(cron("0 20/2 * * *"), [WEEK[0]]);
    expect(slots.map((slot) => slot.minutesOfDay)).toEqual([20 * 60, 22 * 60]);
  });

  test("*/5 gives 12 occurrences per hour and 288 per day", () => {
    const oneDay = slotsOf(cron("*/5 * * * *"), [WEEK[0]]);
    expect(oneDay).toHaveLength(288);
    expect(oneDay.filter((slot) => slot.minutesOfDay < 60)).toHaveLength(12);
    expect(oneDay.slice(0, 12).map((slot) => slot.minutesOfDay)).toEqual([
      0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55,
    ]);
    expect(slotsOf(cron("*/5 * * * *"))).toHaveLength(288 * 7);
  });
});

describe("expandSchedule: refusals instead of guesses", () => {
  test.each([
    ["too few fields", "0 9 * *"],
    ["too many fields", "0 9 * * * *"],
    ["out-of-range minute", "60 9 * * *"],
    ["out-of-range hour", "0 24 * * *"],
    ["out-of-range weekday", "0 9 * * 8"],
    ["day-of-month zero", "0 9 0 * *"],
    ["inverted range", "0 9 * * 5-1"],
    ["zero step", "*/0 * * * *"],
    ["empty step", "*/ * * * *"],
    ["weekday name", "0 9 * * MON"],
    ["month name", "0 9 * JAN *"],
    ["nested step", "0 9 */2/2 * *"],
    ["empty expression", "   "],
  ])("refuses %s", (_label, expr) => {
    expect(expandSchedule(cron(expr), WEEK)).toBeNull();
  });

  test("refuses a rule whose expansion would exceed the per-week slot bound", () => {
    // Every minute: 1440 slots/day. Two days stay inside the bound, three do not.
    expect(slotsOf(cron("* * * * *"), WEEK.slice(0, 2))).toHaveLength(2880);
    expect(expandSchedule(cron("* * * * *"), WEEK.slice(0, 3))).toBeNull();
    expect(expandSchedule(cron("* * * * *"), WEEK)).toBeNull();
  });

  test("refuses impossible day keys instead of rolling them over", () => {
    for (const bad of ["2025-02-30", "2025-13-01", "2025-04-31", "2025-00-10", "2025-03-00"]) {
      expect(expandSchedule(cron("0 9 * * *"), [bad])).toBeNull();
    }
    // The same date in a leap year is real and must still expand.
    expect(expandSchedule(cron("0 9 * * *"), ["2024-02-29"])?.slots).toHaveLength(1);
    expect(expandSchedule(cron("0 9 * * *"), ["2025-02-29"])).toBeNull();
  });

  test("refuses malformed day keys", () => {
    for (const bad of ["2025-3-2", "20250302", "", "2025-03-02T00:00"]) {
      expect(expandSchedule(cron("0 9 * * *"), [bad])).toBeNull();
    }
  });

  test("refuses a cron schedule with no raw expression", () => {
    expect(expandSchedule({ kind: "cron", display: "매일 09:00", raw: null }, WEEK)).toBeNull();
    expect(expandSchedule({ kind: "cron", display: null, raw: null }, WEEK)).toBeNull();
  });
});

describe("expandSchedule: unanchored intervals are never projected", () => {
  test.each([
    ["every 5 minutes"],
    ["every 5 minutes starting whenever"],
    ["5m"],
    ["매 5분"],
    ["300s"],
  ])("refuses interval text %p because no authoritative anchor exists", (text) => {
    expect(expandSchedule(interval(text), WEEK)).toBeNull();
    expect(expandSchedule({ kind: "interval", display: text, raw: null }, WEEK)).toBeNull();
  });

  test("an explicit */5 cron expands where the equivalent interval rule is refused", () => {
    expect(expandSchedule(interval("every 5 minutes"), [WEEK[0]])).toBeNull();
    expect(slotsOf(cron("*/5 * * * *"), [WEEK[0]])).toHaveLength(288);
  });

  test("once and unknown kinds are refused as well", () => {
    expect(expandSchedule({ kind: "once", display: "2025-03-02 09:00", raw: null }, WEEK)).toBeNull();
    expect(expandSchedule({ kind: "unknown", display: "?", raw: "0 9 * * *" }, WEEK)).toBeNull();
  });
});
