import type {
  NowPosition,
  PlacedEntry,
  SchedulerClock,
  TimelineNowHost,
} from "../types/view";
import { toLocalParts } from "../domain/instant-timezone-resolver";

const TICK_MS = 30_000;

export function nowPosition(nowMs: number): NowPosition {
  const parts = toLocalParts(nowMs);
  const clock = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  return {
    dayKey: parts.dayKey,
    hour: parts.hour,
    minute: parts.minute,
    minutesOfDay: parts.minutesOfDay,
    clock,
  };
}

/**
 * Insertion index for the marker among the entries of one hour, sorted ascending by minute.
 *
 * The marker lands after every entry at or before the current minute, so it reads as "these
 * already passed, these are still ahead" without moving any entry.
 */
export function markerSlotIndex(
  entryMinutes: readonly number[],
  minutesOfDay: number,
): number {
  let index = 0;
  while (index < entryMinutes.length && (entryMinutes[index] as number) <= minutesOfDay) {
    index += 1;
  }
  return index;
}

/**
 * Index of the earliest still-future instant Hermes itself stated as `next_run_at`.
 *
 * Only a stated instant qualifies: no recurrence is projected and no run is assumed to be
 * executing. Returns `-1` when today holds no future stated occurrence.
 */
export function nextRunEntryIndex(entries: readonly PlacedEntry[], nowMs: number): number {
  let best = -1;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] as PlacedEntry;
    if (entry.origin !== "next_run_at" || entry.epochMs < nowMs) continue;
    if (best === -1 || entry.epochMs < (entries[best] as PlacedEntry).epochMs) best = index;
  }
  return best;
}

/**
 * Keeps the "now" line, the past/next entry classes and the minute timer for one day axis.
 *
 * It owns no copy of the timeline data: every update reads the host the view handed over on the
 * last render, so a re-render simply re-mounts and nothing can drift out of sync.
 */
export class TimelineNowMarker {
  private host: TimelineNowHost | null = null;
  private handle: number | null = null;

  constructor(
    private readonly now: () => number,
    private readonly clock: SchedulerClock,
    /** Called when the local day no longer matches the rendered day key. */
    private readonly onDayChange: () => void,
  ) {}

  get isRunning(): boolean {
    return this.handle !== null;
  }

  /** Adopt a freshly rendered axis, place the marker and (optionally) scroll it into view once. */
  mount(host: TimelineNowHost, autoScroll = false): void {
    this.host = host;
    this.sync();
    if (autoScroll) this.scrollToMarker();
  }

  /** Manual "Jump to now": re-place first so the target is current, then scroll. */
  jumpToNow(): void {
    this.sync();
    this.scrollToMarker();
  }

  /** Drop the rendered axis (it no longer exists) while keeping the timer alive. */
  release(): void {
    this.host = null;
  }

  start(): void {
    if (this.handle !== null) return;
    this.handle = this.clock.setInterval(() => this.sync(), TICK_MS);
  }

  stop(): void {
    if (this.handle !== null) this.clock.clearInterval(this.handle);
    this.handle = null;
    this.host = null;
  }

  /** Re-place the marker and refresh past/next classes without rebuilding the axis. */
  sync(): void {
    const host = this.host;
    if (host === null) return;
    const nowMs = this.now();
    const position = nowPosition(nowMs);
    if (position.dayKey !== host.dayKey) {
      this.onDayChange();
      return;
    }
    this.placeMarker(host, position);
    this.markEntries(host, nowMs);
  }

  private placeMarker(host: TimelineNowHost, position: NowPosition): void {
    const slot = host.hourSlots[position.hour];
    if (slot === undefined) return;

    for (let hour = 0; hour < host.hourRows.length; hour += 1) {
      const row = host.hourRows[hour] as HTMLElement;
      row.classList.toggle("hcv-hour-past", hour < position.hour);
      row.classList.toggle("hcv-hour-now", hour === position.hour);
    }

    host.marker.time.textContent = position.clock;
    host.marker.root.setAttribute("aria-label", `Now ${position.clock}`);
    host.marker.root.setAttribute("title", `Now ${position.clock}`);

    const inHour: { minute: number; el: HTMLElement }[] = [];
    for (let index = 0; index < host.entries.length; index += 1) {
      const entry = host.entries[index] as PlacedEntry;
      const el = host.entryEls[index];
      if (el === undefined || Math.floor(entry.minutesOfDay / 60) !== position.hour) continue;
      inHour.push({ minute: entry.minutesOfDay, el });
    }
    const target = markerSlotIndex(
      inHour.map((item) => item.minute),
      position.minutesOfDay,
    );
    const before = inHour[target];
    if (before === undefined) slot.appendChild(host.marker.root);
    else slot.insertBefore(host.marker.root, before.el);
  }

  private markEntries(host: TimelineNowHost, nowMs: number): void {
    const nextIndex = nextRunEntryIndex(host.entries, nowMs);
    for (let index = 0; index < host.entries.length; index += 1) {
      const entry = host.entries[index] as PlacedEntry;
      const el = host.entryEls[index];
      if (el === undefined) continue;
      el.classList.toggle("hcv-entry-past", entry.epochMs < nowMs);
      const isNext = index === nextIndex;
      el.classList.toggle("hcv-entry-next", isNext);
      if (isNext) el.setAttribute("data-hcv-next", "Next scheduled run");
      else el.removeAttribute("data-hcv-next");
    }
  }

  private scrollToMarker(): void {
    const root = this.host?.marker.root;
    if (root === undefined || typeof root.scrollIntoView !== "function") return;
    root.scrollIntoView({ block: "center" });
  }
}
