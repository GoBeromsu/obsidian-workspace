import { describe, expect, mock, test } from "bun:test";
import type { CronJobRecord } from "../src/types/hermes-cron";
import type { PlacedEntry, SchedulerClock, TimelineNowHost } from "../src/types/view";
import {
  TimelineNowMarker,
  markerSlotIndex,
  nextRunEntryIndex,
  nowPosition,
} from "../src/ui/timeline-now-marker";

mock.module("obsidian", () => ({ setIcon: () => {}, Notice: class {} }));
const { staleCacheTitle, visibleStaleEntries } = await import("../src/ui/stale-cache-indicator");
type FreshnessEntry = import("../src/ui/stale-cache-indicator").FreshnessEntry;

/** Minimal element: only the operations the marker actually performs on the rendered axis. */
interface FakeEl {
  readonly classes: Set<string>;
  readonly attrs: Record<string, string>;
  children: FakeEl[];
  textContent: string;
  classList: { toggle(cls: string, on: boolean): void };
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  appendChild(child: FakeEl): void;
  insertBefore(child: FakeEl, before: FakeEl): void;
}

function fakeEl(): FakeEl {
  const el: FakeEl = {
    classes: new Set<string>(),
    attrs: {},
    children: [],
    textContent: "",
    classList: {
      toggle(cls, on) {
        if (on) el.classes.add(cls);
        else el.classes.delete(cls);
      },
    },
    setAttribute(name, value) {
      el.attrs[name] = value;
    },
    removeAttribute(name) {
      delete el.attrs[name];
    },
    appendChild(child) {
      el.children = el.children.filter((item) => item !== child);
      el.children.push(child);
    },
    insertBefore(child, before) {
      el.children = el.children.filter((item) => item !== child);
      const index = el.children.indexOf(before);
      el.children.splice(index < 0 ? el.children.length : index, 0, child);
    },
  };
  return el;
}

function job(id: string): CronJobRecord {
  return { id, name: id, source: { alias: "a", profileId: "p" } } as unknown as CronJobRecord;
}

function entry(id: string, atLocal: string, origin: PlacedEntry["origin"]): PlacedEntry {
  const date = new Date(atLocal);
  const minutes = date.getHours() * 60 + date.getMinutes();
  return {
    job: job(id),
    origin,
    epochMs: date.getTime(),
    dayKey: "2026-09-13",
    minutesOfDay: minutes,
    localClock: atLocal.slice(11, 16),
    raw: atLocal,
  };
}

function fakeClock(): SchedulerClock & { live: Set<number>; fire(): void } {
  const handlers = new Map<number, () => void>();
  let next = 1;
  return {
    live: new Set<number>(),
    setInterval(handler) {
      const handle = next++;
      handlers.set(handle, handler);
      this.live.add(handle);
      return handle;
    },
    clearInterval(handle) {
      handlers.delete(handle);
      this.live.delete(handle);
    },
    fire() {
      for (const handler of [...handlers.values()]) handler();
    },
  };
}

function buildHost(entries: readonly PlacedEntry[]): {
  host: TimelineNowHost;
  rows: FakeEl[];
  slots: FakeEl[];
  entryEls: FakeEl[];
  marker: FakeEl;
  time: FakeEl;
} {
  const rows: FakeEl[] = [];
  const slots: FakeEl[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    rows.push(fakeEl());
    slots.push(fakeEl());
  }
  const entryEls = entries.map((item) => {
    const el = fakeEl();
    (slots[Math.floor(item.minutesOfDay / 60)] as FakeEl).appendChild(el);
    return el;
  });
  const marker = fakeEl();
  const time = fakeEl();
  const host = {
    dayKey: "2026-09-13",
    hourRows: rows as unknown as readonly HTMLElement[],
    hourSlots: slots as unknown as readonly HTMLElement[],
    entries,
    entryEls: entryEls as unknown as readonly HTMLElement[],
    marker: { root: marker as unknown as HTMLElement, time: time as unknown as HTMLElement },
  };
  return { host, rows, slots, entryEls, marker, time };
}

describe("now position", () => {
  test("reports the local hour, minute and clock", () => {
    const at = new Date("2026-09-13T14:07:00").getTime();
    expect(nowPosition(at)).toMatchObject({ dayKey: "2026-09-13", hour: 14, clock: "14:07" });
  });

  test("day key flips exactly at the local midnight boundary", () => {
    expect(nowPosition(new Date("2026-09-13T23:59:00").getTime())).toMatchObject({
      dayKey: "2026-09-13",
      hour: 23,
      clock: "23:59",
    });
    expect(nowPosition(new Date("2026-09-14T00:00:00").getTime())).toMatchObject({
      dayKey: "2026-09-14",
      hour: 0,
      clock: "00:00",
    });
  });
});

describe("marker slot index", () => {
  test("lands after every entry at or before the current minute", () => {
    const minutes = [14 * 60 + 5, 14 * 60 + 30, 14 * 60 + 55];
    expect(markerSlotIndex(minutes, 14 * 60)).toBe(0);
    expect(markerSlotIndex(minutes, 14 * 60 + 5)).toBe(1);
    expect(markerSlotIndex(minutes, 14 * 60 + 31)).toBe(2);
    expect(markerSlotIndex(minutes, 14 * 60 + 59)).toBe(3);
    expect(markerSlotIndex([], 0)).toBe(0);
  });
});

describe("next stated run selection", () => {
  const now = new Date("2026-09-13T14:07:00").getTime();

  test("picks the earliest future next_run_at only", () => {
    const entries = [
      entry("past-next", "2026-09-13T09:00:00", "next_run_at"),
      entry("last", "2026-09-13T15:00:00", "last_run_at"),
      entry("soon", "2026-09-13T16:30:00", "next_run_at"),
      entry("later", "2026-09-13T18:00:00", "next_run_at"),
    ];
    expect(nextRunEntryIndex(entries, now)).toBe(2);
  });

  test("returns -1 when no stated future occurrence exists today", () => {
    const entries = [
      entry("last", "2026-09-13T09:00:00", "last_run_at"),
      entry("past-next", "2026-09-13T10:00:00", "next_run_at"),
    ];
    expect(nextRunEntryIndex(entries, now)).toBe(-1);
  });
});

describe("timeline now marker", () => {
  const entries = [
    entry("early", "2026-09-13T14:05:00", "last_run_at"),
    entry("late", "2026-09-13T14:40:00", "next_run_at"),
  ];

  test("places the marker in the current hour between the surrounding entries", () => {
    const clock = fakeClock();
    let now = new Date("2026-09-13T14:07:00").getTime();
    const marker = new TimelineNowMarker(() => now, clock, () => {});
    const built = buildHost(entries);
    marker.mount(built.host);

    expect(built.slots[14]?.children).toEqual([
      built.entryEls[0] as FakeEl,
      built.marker,
      built.entryEls[1] as FakeEl,
    ]);
    expect(built.time.textContent).toBe("14:07");
    expect(built.rows[13]?.classes.has("hcv-hour-past")).toBe(true);
    expect(built.rows[14]?.classes.has("hcv-hour-now")).toBe(true);
    expect(built.entryEls[0]?.classes.has("hcv-entry-past")).toBe(true);
    expect(built.entryEls[1]?.classes.has("hcv-entry-next")).toBe(true);

    now = new Date("2026-09-13T14:45:00").getTime();
    marker.start();
    clock.fire();
    expect(built.time.textContent).toBe("14:45");
    expect(built.slots[14]?.children).toEqual([
      built.entryEls[0] as FakeEl,
      built.entryEls[1] as FakeEl,
      built.marker,
    ]);
    expect(built.entryEls[1]?.classes.has("hcv-entry-next")).toBe(false);
    expect(built.entryEls[1]?.classes.has("hcv-entry-past")).toBe(true);
    marker.stop();
  });

  test("a local day change asks the view to rebuild instead of moving the marker", () => {
    const clock = fakeClock();
    let now = new Date("2026-09-13T23:59:00").getTime();
    let rebuilds = 0;
    const marker = new TimelineNowMarker(() => now, clock, () => (rebuilds += 1));
    const built = buildHost(entries);
    marker.mount(built.host);
    marker.start();
    expect(rebuilds).toBe(0);
    expect(built.slots[23]?.children).toEqual([built.marker]);

    now = new Date("2026-09-14T00:01:00").getTime();
    clock.fire();
    expect(rebuilds).toBe(1);
    expect(built.slots[23]?.children).toEqual([built.marker]);
    marker.stop();
  });

  test("stop clears the timer and later ticks cannot touch the axis", () => {
    const clock = fakeClock();
    const now = new Date("2026-09-13T14:07:00").getTime();
    const marker = new TimelineNowMarker(() => now, clock, () => {});
    const built = buildHost(entries);
    marker.mount(built.host);
    marker.start();
    expect(clock.live.size).toBe(1);
    marker.stop();
    expect(clock.live.size).toBe(0);
    expect(marker.isRunning).toBe(false);
    built.time.textContent = "";
    clock.fire();
    expect(built.time.textContent).toBe("");
  });
});

describe("stale cache hint", () => {
  const stale: FreshnessEntry = {
    label: "a / p",
    state: {
      transport: "disconnected",
      sourceStatus: "read",
      lastUpdatedAt: "2026-09-13T10:00:00.000Z",
      stale: true,
      detail: "connection refused",
    },
  };
  const fresh: FreshnessEntry = { ...stale, label: "b / q", state: { ...stale.state, stale: false } };

  test("only stale sources that are visible under the filter count", () => {
    expect(visibleStaleEntries([stale, fresh], new Set(["a / p", "b / q"]))).toEqual([stale]);
    expect(visibleStaleEntries([stale, fresh], new Set(["b / q"]))).toEqual([]);
  });

  test("the tooltip states the cause and last read without naming sources", () => {
    const title = staleCacheTitle([stale]);
    expect(title).toContain("Showing cached schedule");
    expect(title).toContain("connection refused");
    expect(title).toContain(new Date("2026-09-13T10:00:00.000Z").toLocaleString());
    expect(title).not.toContain("a / p");
  });
});
