import { ItemView, setIcon, type WorkspaceLeaf } from "obsidian";
import type { CronJobRecord } from "../types/hermes-cron";
import { JobDetailModal } from "./job-detail-modal";
import { buildTodayColumn } from "../domain/week-grid-builder";
import type { PlacedEntry, TimelineNowHost } from "../types/view";
import { renderFilterBar } from "./filter-bar";
import { freshnessLabel, renderStaleCacheIcon } from "./stale-cache-indicator";
import { renderUnplacedPanel } from "./unplaced-instants-panel";
import type { ViewerState } from "./viewer-state";
import { NOTICES } from "./notices";
import { TimelineNowMarker } from "./timeline-now-marker";

export const TODAY_TIMELINE_VIEW = "hermes-cron-today-timeline";

/** Makes an entry reachable and actionable by keyboard, matching its click action. */
function makeActivatable(el: HTMLElement, action: () => void): void {
  el.setAttribute("tabindex", "0");
  el.setAttribute("role", "button");
  el.addEventListener("click", action);
  el.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    action();
  });
}

/** Vertical axis for today, rendered from native-stated instants only. */
export class TodayTimelineView extends ItemView {
  private unsubscribe: (() => void) | null = null;
  /** The axis is scrolled to the current hour on the first open of this view only. */
  private autoScrolled = false;
  private readonly nowMarker = new TimelineNowMarker(
    () => Date.now(),
    {
      setInterval: (handler, ms) => globalThis.setInterval(handler, ms) as unknown as number,
      clearInterval: (handle) => globalThis.clearInterval(handle),
    },
    () => this.render(),
  );

  constructor(leaf: WorkspaceLeaf, private readonly state: ViewerState) {
    super(leaf);
  }

  override getViewType(): string {
    return TODAY_TIMELINE_VIEW;
  }

  override getDisplayText(): string {
    return "Hermes: Today";
  }

  override getIcon(): string {
    return "clock";
  }

  override async onOpen(): Promise<void> {
    this.unsubscribe = this.state.subscribe(() => this.render());
    this.state.scheduler?.viewOpened();
    this.render();
    this.nowMarker.start();
  }

  private openDetail(job: CronJobRecord): void {
    const profile = this.state.profileFor(job.source);
    if (profile === undefined) return;
    new JobDetailModal(
      this.app,
      job,
      profile,
      this.state.adapter,
      this.state.bodies,
      this.state.getSettings().historyLimit,
    ).open();
  }

  override async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.nowMarker.stop();
    this.state.scheduler?.viewClosed();
  }

  private render(): void {
    const root = this.contentEl;
    // A poll-driven re-render must not move the reader: keep whatever they had scrolled to.
    const scrollTop = root.scrollTop;
    root.empty();
    root.addClass("hcv-root");

    renderFilterBar(root, this.state);

    const snapshots = this.state.filteredSnapshots();
    if (snapshots.length === 0) {
      root.createEl("p", { cls: "hcv-empty", text: NOTICES.noSelection });
      this.nowMarker.release();
      root.scrollTop = scrollTop;
      return;
    }

    const { column, unplaced } = buildTodayColumn(this.state.filteredJobs(), Date.now());
    const header = root.createDiv({ cls: "hcv-day-header" });
    header.createEl("h3", { cls: "hcv-day-title", text: column.dayKey });
    const jump = header.createEl("button", {
      cls: "hcv-doc-action hcv-jump-now",
      attr: { type: "button", "aria-label": "Jump to now", title: "Jump to now" },
    });
    setIcon(jump, "crosshair");
    jump.addEventListener("click", () => this.nowMarker.jumpToNow());
    // Freshness hint only: cached content must never read as a live schedule.
    renderStaleCacheIcon(
      header,
      this.state.freshnessEntries(),
      new Set(snapshots.map((snapshot) => freshnessLabel(snapshot.source))),
    );

    // Entries are rendered inside their own hour row, so position needs no runtime style.
    const axis = root.createDiv({ cls: "hcv-axis" });
    const rows: HTMLElement[] = [];
    const slots: HTMLElement[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const row = axis.createDiv({ cls: "hcv-hour" });
      row.createSpan({ cls: "hcv-hour-label", text: `${String(hour).padStart(2, "0")}:00` });
      rows.push(row);
      slots.push(row.createDiv({ cls: "hcv-hour-slot" }));
    }

    const entries: PlacedEntry[] = [];
    const entryEls: HTMLElement[] = [];
    for (const entry of column.entries) {
      const slot = slots[Math.floor(entry.minutesOfDay / 60)];
      if (slot === undefined) continue;
      entries.push(entry);
      entryEls.push(this.renderEntry(slot, entry));
    }

    if (column.entries.length === 0) {
      root.createEl("p", {
        cls: "hcv-empty",
        text: "No Hermes-stated run instants fall on today for the current filter.",
      });
    }

    renderUnplacedPanel(root, unplaced);

    const marker = root.createDiv({ cls: "hcv-now" });
    marker.createSpan({ cls: "hcv-now-dot" });
    const host: TimelineNowHost = {
      dayKey: column.dayKey,
      hourRows: rows,
      hourSlots: slots,
      entries,
      entryEls,
      marker: { root: marker, time: marker.createSpan({ cls: "hcv-now-time" }) },
    };
    const firstOpen = !this.autoScrolled;
    this.autoScrolled = true;
    this.nowMarker.mount(host, firstOpen);
    if (!firstOpen) root.scrollTop = scrollTop;
  }

  private renderEntry(parent: HTMLElement, entry: PlacedEntry): HTMLElement {
    const block = parent.createDiv({ cls: `hcv-entry hcv-entry-${entry.origin}` });
    block.createSpan({ cls: "hcv-entry-time", text: entry.localClock });
    block.createSpan({ cls: "hcv-entry-name", text: entry.job.name ?? entry.job.id });
    block.createSpan({
      cls: "hcv-entry-source",
      text: `${entry.job.source.alias}/${entry.job.source.profileId}`,
    });
    block.createSpan({
      cls: "hcv-entry-origin",
      text: entry.origin === "next_run_at" ? "next run" : "last run",
    });
    const label = `${entry.localClock} ${entry.job.name ?? entry.job.id} (${entry.raw}) - ${
      entry.origin === "next_run_at" ? "next run" : "last run"
    } stated by Hermes; ${entry.job.source.alias}/${entry.job.source.profileId}`;
    block.setAttribute("aria-label", label);
    block.setAttribute("title", label);
    const badge = block.createSpan({ cls: "hcv-entry-next-badge" });
    setIcon(badge, "alarm-clock");
    badge.createSpan({ cls: "hcv-entry-next-text", text: "Next scheduled run" });
    badge.setAttribute("title", "Next scheduled run stated by Hermes");
    block.dataset.jobId = entry.job.id;
    makeActivatable(block, () => this.openDetail(entry.job));
    return block;
  }
}
