import { describe, expect, test } from "bun:test";
import type { CronJobRecord, SourceKey } from "../src/types/hermes-cron";
import { buildWeekGrid } from "../src/domain/week-grid-builder";
import { toLocalParts } from "../src/domain/instant-timezone-resolver";

const SOURCE: SourceKey = { alias: "m1-file", profileId: "default" };

function job(id: string, overrides: Partial<CronJobRecord> = {}): CronJobRecord {
  return {
    source: SOURCE,
    id,
    name: id,
    enabled: true,
    state: null,
    schedule: { kind: "cron", display: "daily", raw: "0 9 * * *" },
    nextRunAt: null,
    lastRunAt: null,
    lastStatus: "absent",
    lastStatusRaw: null,
    lastDeliveryUnverified: false,
    failureStreak: null,
    latestExecutionId: null,
    latestExecutionStatus: null,
    lastDispatch: null,
    prompt: null,
    lastError: null,
    lastDeliveryError: null,
    unparsedFields: [],
    ...overrides,
  };
}

function cron(id: string, raw: string, overrides: Partial<CronJobRecord> = {}): CronJobRecord {
  return job(id, { schedule: { kind: "cron", display: raw, raw }, ...overrides });
}

/** Local ISO string with the machine's own offset, so tests do not assume a fixed timezone. */
function localIso(year: number, month: number, day: number, hour: number, minute = 0): string {
  const date = new Date(year, month - 1, day, hour, minute);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const NOW = new Date(2026, 8, 12, 12).getTime();

function hourOf(jobs: readonly CronJobRecord[], hour: number) {
  const grid = buildWeekGrid(jobs, NOW);
  const today = grid.days.find((day) => day.isToday);
  expect(today?.dayKey).toBe(toLocalParts(NOW).dayKey);
  const cell = today?.hours[hour];
  expect(cell).toBeDefined();
  return cell!;
}

describe("rule occurrence grouping", () => {
  test("*/5 becomes one grouped chip holding all twelve clocks of the hour", () => {
    const cell = hourOf([cron("dense", "*/5 * * * *")], 13);
    expect(cell.ruleChips).toHaveLength(1);
    const chip = cell.ruleChips[0];
    expect(chip?.collapsed).toBe(true);
    expect(chip?.count).toBe(12);
    expect(chip?.clocks).toHaveLength(12);
    // Every exact instant stays available for the hover label, in order.
    expect(chip?.clocks[0]).toBe("13:00");
    expect(chip?.clocks[11]).toBe("13:55");
    expect(chip?.rule).toBe("*/5 * * * *");
  });

  test("*/30 becomes one grouped chip of two clocks instead of two chips", () => {
    const cell = hourOf([cron("half", "*/30 * * * *")], 9);
    expect(cell.ruleChips).toHaveLength(1);
    expect(cell.ruleChips[0]?.count).toBe(2);
    expect(cell.ruleChips[0]?.collapsed).toBe(true);
    expect(cell.ruleChips[0]?.clocks).toEqual(["09:00", "09:30"]);
  });

  test("a single occurrence in the hour stays one ungrouped chip", () => {
    const cell = hourOf([cron("hourly", "0 * * * *")], 7);
    expect(cell.ruleChips).toHaveLength(1);
    expect(cell.ruleChips[0]?.collapsed).toBe(false);
    expect(cell.ruleChips[0]?.count).toBe(1);
    expect(cell.ruleChips[0]?.clocks).toEqual(["07:00"]);
  });

  test("the same job id under two source profiles is never merged", () => {
    const cell = hourOf(
      [
        cron("shared", "*/30 * * * *"),
        cron("shared", "*/30 * * * *", { source: { alias: "m1-file", profileId: "work" } }),
      ],
      9,
    );
    expect(cell.ruleChips).toHaveLength(2);
    expect(cell.ruleChips.map((chip) => chip.job.source.profileId)).toEqual(["default", "work"]);
    for (const chip of cell.ruleChips) expect(chip.count).toBe(2);
  });

  test("different job ids in the same hour stay separate chips", () => {
    const cell = hourOf([cron("a", "*/30 * * * *"), cron("b", "*/30 * * * *")], 9);
    expect(cell.ruleChips).toHaveLength(2);
    expect(cell.ruleChips.map((chip) => chip.job.id)).toEqual(["a", "b"]);
  });

  test("a disabled job projects no rule chips but keeps its stated instants", () => {
    const grid = buildWeekGrid(
      [
        cron("off", "*/30 * * * *", {
          enabled: false,
          nextRunAt: localIso(2026, 9, 12, 9, 30),
          lastRunAt: localIso(2026, 9, 12, 9),
        }),
      ],
      NOW,
    );
    const today = grid.days.find((day) => day.isToday);
    expect(today?.ruleCount).toBe(0);
    expect(today?.hours.flatMap((cell) => cell.ruleChips)).toHaveLength(0);
    // Hermes still stated these two instants; disabling the rule must not erase them.
    expect(today?.entries.map((entry) => entry.origin).sort()).toEqual([
      "last_run_at",
      "next_run_at",
    ]);
    expect(today?.hours[9]?.entries.map((entry) => entry.localClock)).toEqual(["09:00", "09:30"]);
  });
});
