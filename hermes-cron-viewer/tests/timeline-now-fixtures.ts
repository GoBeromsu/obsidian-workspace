import type { CronJobRecord } from "../src/types/hermes-cron";
import type { PlacedEntry, SchedulerClock, TimelineNowHost } from "../src/types/view";

/** Minimal element: only the operations the marker actually performs on the rendered axis. */
export interface FakeEl {
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

export function fakeEl(): FakeEl {
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

export function job(id: string): CronJobRecord {
  return { id, name: id, source: { alias: "a", profileId: "p" } } as unknown as CronJobRecord;
}

export function entry(id: string, atLocal: string, origin: PlacedEntry["origin"]): PlacedEntry {
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

export function fakeClock(): SchedulerClock & { live: Set<number>; fire(): void } {
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

export function buildHost(entries: readonly PlacedEntry[]): {
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
