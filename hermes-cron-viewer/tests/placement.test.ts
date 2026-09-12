import { describe, expect, test } from "bun:test";
import type { CronJobRecord, SourceKey } from "../src/types/hermes-cron";
import { placeInstants } from "../src/domain/timeline-placement";
import { buildTodayColumn, buildWeekGrid, weekDayKeys } from "../src/domain/week-grid-builder";
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

/** Local ISO string with the machine's own offset, so tests do not assume a fixed timezone. */
function localIso(year: number, month: number, day: number, hour: number, minute = 0): string {
  const date = new Date(year, month - 1, day, hour, minute);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

describe("timeline placement", () => {
  test("places exactly the instants native stated, never a projected one", () => {
    const nextRun = localIso(2026, 9, 12, 9);
    const lastRun = localIso(2026, 9, 12, 8);
    const dayKey = toLocalParts(new Date(2026, 8, 12, 9).getTime()).dayKey;

    const { placed } = placeInstants([job("a", { nextRunAt: nextRun, lastRunAt: lastRun })], [dayKey]);

    // A weekly cron stores one future instant; the axis must not invent six more.
    expect(placed).toHaveLength(2);
    expect(placed.map((entry) => entry.origin).sort()).toEqual(["last_run_at", "next_run_at"]);
    expect(placed[0]?.localClock).toBe("08:00");
    expect(placed[0]?.raw).toBe(lastRun);
  });

  test("lists offset-free and unparsable instants instead of guessing a position", () => {
    const dayKey = toLocalParts(Date.now()).dayKey;
    const { placed, unplaced } = placeInstants(
      [job("a", { nextRunAt: "2026-09-12T09:00:00" }), job("b", { nextRunAt: "soon" })],
      [dayKey],
    );
    expect(placed).toHaveLength(0);
    expect(unplaced.map((entry) => entry.reason)).toEqual(["timezone-unknown", "unparsed"]);
    expect(unplaced[0]?.raw).toBe("2026-09-12T09:00:00");
  });

  test("orders equal instants stably by job id", () => {
    const at = localIso(2026, 9, 12, 9);
    const dayKey = toLocalParts(new Date(2026, 8, 12, 9).getTime()).dayKey;
    const jobs = [job("c", { nextRunAt: at }), job("a", { nextRunAt: at }), job("b", { nextRunAt: at })];
    const first = placeInstants(jobs, [dayKey]).placed.map((entry) => entry.job.id);
    const second = placeInstants([...jobs].reverse(), [dayKey]).placed.map((entry) => entry.job.id);
    expect(first).toEqual(["a", "b", "c"]);
    expect(second).toEqual(first);
  });

  test("midnight lands on the following day with zero minutes offset", () => {
    const midnight = localIso(2026, 9, 13, 0);
    const dayKey = toLocalParts(new Date(2026, 8, 13, 0).getTime()).dayKey;
    const { placed } = placeInstants([job("a", { nextRunAt: midnight })], [dayKey]);
    expect(placed[0]?.minutesOfDay).toBe(0);
    expect(placed[0]?.localClock).toBe("00:00");
  });

  test("ignores instants outside the requested days", () => {
    const { placed } = placeInstants(
      [job("a", { nextRunAt: localIso(2026, 9, 20, 9) })],
      [toLocalParts(new Date(2026, 8, 12, 9).getTime()).dayKey],
    );
    expect(placed).toHaveLength(0);
  });
});

describe("week grid", () => {
  test("produces seven distinct days including across a DST transition", () => {
    // US DST transitions: 2026-03-08 and 2026-11-01. Both weeks must still hold seven days.
    for (const date of [new Date(2026, 2, 10, 12), new Date(2026, 10, 3, 12), new Date(2026, 8, 12, 12)]) {
      const keys = weekDayKeys(date.getTime());
      expect(keys).toHaveLength(7);
      expect(new Set(keys).size).toBe(7);
    }
  });

  test("week starts on the configured weekday and marks today", () => {
    const now = new Date(2026, 8, 12, 12).getTime();
    const grid = buildWeekGrid([], now);
    expect(grid.days).toHaveLength(7);
    expect(grid.days[0]?.weekdayIndex).toBe(0);
    expect(grid.days.filter((day) => day.isToday)).toHaveLength(1);
    expect(grid.days.find((day) => day.isToday)?.dayKey).toBe(toLocalParts(now).dayKey);

    const mondayFirst = buildWeekGrid([], now, 1);
    expect(new Date(`${mondayFirst.days[0]?.dayKey}T00:00:00`).getDay()).toBe(1);
  });

  test("assigns a weekly job to exactly one column and keeps unplaced separate", () => {
    const now = new Date(2026, 8, 12, 12).getTime();
    const inWeek = weekDayKeys(now)[3] ?? "";
    const [year, month, day] = inWeek.split("-").map(Number);
    const grid = buildWeekGrid(
      [
        job("weekly", { nextRunAt: localIso(year ?? 2026, month ?? 9, day ?? 12, 10) }),
        job("naive", { nextRunAt: "2026-09-12T10:00:00" }),
      ],
      now,
    );

    const withEntries = grid.days.filter((column) => column.entries.length > 0);
    expect(withEntries).toHaveLength(1);
    expect(withEntries[0]?.entries[0]?.job.id).toBe("weekly");
    expect(grid.unplaced.map((entry) => entry.job.id)).toEqual(["naive"]);
  });

  test("today column carries only today's instants", () => {
    const now = new Date(2026, 8, 12, 12).getTime();
    const { column, unplaced } = buildTodayColumn(
      [
        job("today", { nextRunAt: localIso(2026, 9, 12, 15) }),
        job("tomorrow", { nextRunAt: localIso(2026, 9, 13, 15) }),
        job("naive", { nextRunAt: "2026-09-12T15:00:00" }),
      ],
      now,
    );
    expect(column.dayKey).toBe(toLocalParts(now).dayKey);
    expect(column.entries.map((entry) => entry.job.id)).toEqual(["today"]);
    expect(unplaced.map((entry) => entry.job.id)).toEqual(["naive"]);
  });
});
