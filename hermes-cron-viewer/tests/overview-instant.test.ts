import { describe, expect, test } from "bun:test";
import { formatOverviewInstant } from "../src/domain/overview-instant";

const SEOUL = { timeZone: "Asia/Seoul" } as const;
const UTC = { timeZone: "UTC" } as const;

describe("overview instant: explicit offsets are converted, never guessed", () => {
  test("an offset value is placed on a local clock", () => {
    const shown = formatOverviewInstant("2026-09-13T02:52:00+09:00", SEOUL);
    expect(shown.kind).toBe("absolute");
    expect(shown.clock).toBe("02:52");
    expect(shown.context).toContain("Sep 13, 2026");
  });

  test("the same instant renders a different clock in a different zone", () => {
    const seoul = formatOverviewInstant("2026-09-13T02:52:00+09:00", SEOUL);
    const utc = formatOverviewInstant("2026-09-13T02:52:00+09:00", UTC);
    expect(utc.clock).toBe("17:52");
    expect(utc.context).toContain("Sep 12, 2026");
    expect(seoul.clock).not.toBe(utc.clock);
  });

  test("`Z` is an explicit offset and converts", () => {
    const shown = formatOverviewInstant("2026-09-12T17:52:00Z", SEOUL);
    expect(shown.kind).toBe("absolute");
    expect(shown.clock).toBe("02:52");
  });

  test("the context line names a timezone", () => {
    const shown = formatOverviewInstant("2026-09-13T02:52:00+09:00", UTC);
    expect(shown.context).toMatch(/UTC|GMT/);
  });
});

describe("overview instant: midnight and date rollover", () => {
  test("midnight is `00:00`, never `24:00`", () => {
    const shown = formatOverviewInstant("2026-01-01T00:00:00+09:00", SEOUL);
    expect(shown.clock).toBe("00:00");
    expect(shown.context).toContain("Jan 1, 2026");
  });

  test("a conversion that crosses midnight moves the date backwards", () => {
    const shown = formatOverviewInstant("2026-01-01T00:30:00+09:00", UTC);
    expect(shown.clock).toBe("15:30");
    expect(shown.context).toContain("Dec 31, 2025");
  });

  test("a conversion that crosses midnight moves the date forwards", () => {
    const shown = formatOverviewInstant("2025-12-31T23:30:00Z", SEOUL);
    expect(shown.clock).toBe("08:30");
    expect(shown.context).toContain("Jan 1, 2026");
  });
});

describe("overview instant: offset-free values are refused, not guessed", () => {
  test("a naive timestamp keeps its text and states the zone is unknown", () => {
    const shown = formatOverviewInstant("2026-09-13 02:52:00", SEOUL);
    expect(shown.kind).toBe("verbatim");
    expect(shown.clock).toBeNull();
    expect(shown.context).toBe("Time zone unknown");
    expect(shown.raw).toBe("2026-09-13 02:52:00");
  });

  test("the unknown-zone title still carries the exact stored text", () => {
    const shown = formatOverviewInstant("2026-09-13T02:52", UTC);
    expect(shown.title).toContain("2026-09-13T02:52");
    expect(shown.title).toContain("Time zone unknown");
  });
});

describe("overview instant: malformed and missing values stay neutral", () => {
  test("an unrecognized string is shown verbatim without a clock", () => {
    const shown = formatOverviewInstant("soon", SEOUL);
    expect(shown.kind).toBe("verbatim");
    expect(shown.clock).toBeNull();
    expect(shown.raw).toBe("soon");
    expect(shown.context).toBe("Unrecognized time format");
  });

  test("an ISO-shaped but impossible date is not placed", () => {
    const shown = formatOverviewInstant("2026-13-45T99:99:00+09:00", SEOUL);
    expect(shown.kind).toBe("verbatim");
    expect(shown.clock).toBeNull();
  });

  test.each([null, undefined, "", "   "])("%p is unavailable, not epoch zero", (raw) => {
    const shown = formatOverviewInstant(raw, { ...SEOUL, unavailable: "Not stated" });
    expect(shown.kind).toBe("unavailable");
    expect(shown.clock).toBeNull();
    expect(shown.raw).toBeNull();
    expect(shown.context).toBe("Not stated");
    expect(shown.context).not.toContain("1970");
  });

  test("the unavailable label defaults to plain English", () => {
    expect(formatOverviewInstant(null).context).toBe("Not recorded");
  });
});

describe("overview instant: the stored text is preserved exactly", () => {
  test.each([
    "2026-09-13T02:52:00.123456+09:00",
    "2026-09-13 02:52:00+0900",
    "2026-09-13T02:52:00Z",
    " 2026-09-13T02:52:00+09:00 ",
    "not a timestamp at all",
  ])("%p round-trips unmodified", (raw) => {
    expect(formatOverviewInstant(raw, SEOUL).raw).toBe(raw);
  });

  test("the title of a placed instant is the raw value alone", () => {
    const raw = "2026-09-13T02:52:00.500+09:00";
    const shown = formatOverviewInstant(raw, SEOUL);
    expect(shown.kind).toBe("absolute");
    expect(shown.title).toBe(raw);
  });
});
