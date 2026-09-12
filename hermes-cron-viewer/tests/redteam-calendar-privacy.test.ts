import { describe, expect, test } from "bun:test";
import type { CronJobRecord, SourceKey } from "../src/types/hermes-cron";
import { placeInstants } from "../src/domain/timeline-placement";
import { buildWeekGrid, weekDayKeys } from "../src/domain/week-grid-builder";
import { toLocalParts } from "../src/domain/instant-timezone-resolver";
import { projectSnapshot } from "../src/domain/snapshot-projection";
import type { SourceSnapshot } from "../src/types/snapshot";
import { Logger } from "../src/utils/logger";

const SOURCE: SourceKey = { alias: "m1-file", profileId: "default" };
const BODY = "PROMPT-BODY-MUST-NOT-LEAK";

function localIso(year: number, month: number, day: number, hour: number): string {
  const date = new Date(year, month - 1, day, hour);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function job(id: string, overrides: Partial<CronJobRecord> = {}): CronJobRecord {
  return {
    source: SOURCE,
    id,
    name: id,
    enabled: true,
    state: null,
    schedule: { kind: "cron", display: "0 9 * * *", raw: "0 9 * * *" },
    nextRunAt: null,
    lastRunAt: null,
    lastStatus: "ok",
    lastStatusRaw: null,
    lastDeliveryUnverified: false,
    failureStreak: null,
    latestExecutionId: null,
    latestExecutionStatus: null,
    lastDispatch: null,
    prompt: BODY,
    lastError: `error ${BODY}`,
    lastDeliveryError: `delivery ${BODY}`,
    unparsedFields: [],
    ...overrides,
  };
}

describe("calendar places only Hermes-stated instants (AC3 / AC6 / AC14)", () => {
  test("a weekly cron with one next_run_at does not fill the other six days", () => {
    const now = new Date(2026, 8, 12, 12).getTime();
    const inWeek = weekDayKeys(now)[3] ?? "";
    const [year, month, day] = inWeek.split("-").map(Number);
    const next = localIso(year ?? 2026, month ?? 9, day ?? 12, 10);
    const grid = buildWeekGrid([job("weekly", { nextRunAt: next })], now);
    const occupied = grid.days.filter((column) => column.entries.length > 0);
    expect(occupied).toHaveLength(1);
    expect(occupied[0]?.entries).toHaveLength(1);
    expect(occupied[0]?.entries[0]?.origin).toBe("next_run_at");
    expect(occupied[0]?.entries[0]?.raw).toBe(next);
    expect(grid.days).toHaveLength(7);
  });

  test("naive timestamps stay off the axis as verbatim unplaced rows", () => {
    const dayKey = toLocalParts(new Date(2026, 8, 12, 9).getTime()).dayKey;
    const { placed, unplaced } = placeInstants(
      [job("naive", { nextRunAt: "2026-09-12T09:00:00" })],
      [dayKey],
    );
    expect(placed).toHaveLength(0);
    expect(unplaced).toHaveLength(1);
    expect(unplaced[0]?.raw).toBe("2026-09-12T09:00:00");
    expect(unplaced[0]?.reason).toBe("timezone-unknown");
  });
});

describe("bodies never reach disk projection or logs (AC19)", () => {
  test("projection and logger drop prompt/error text at every nesting depth", () => {
    const snapshot: SourceSnapshot = {
      source: SOURCE,
      home: "/Users/beomsu/.hermes",
      jobs: [job("a")],
      transport: "connected",
      sourceStatus: "read",
      statusDetail: null,
      lastUpdatedAt: "t",
      unparsedFields: [],
    };
    const projected = projectSnapshot(snapshot, [], [], { persistJobNames: true });
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain(BODY);
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("lastError");

    const lines: string[] = [];
    const original = console.log;
    console.log = (line: unknown) => void lines.push(String(line));
    try {
      new Logger().round({
        sources: 1, commands: 3, durationMs: 1, parseFailures: 0,
        timezoneUnknown: 0, ledgerUnavailable: 1, capExceeded: 0, rejectedCommands: 0,
      });
    } finally {
      console.log = original;
    }
    expect(lines.join("\n")).not.toContain(BODY);
  });
});
