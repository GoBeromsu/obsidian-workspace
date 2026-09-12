import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { CronJobRecord } from "../types/hermes-cron";
import { JobDetailModal } from "./job-detail-modal";
import { buildTodayColumn } from "../domain/week-grid-builder";
import { groupSourceStatuses } from "../domain/source-status-groups";
import type { PlacedEntry } from "../types/view";
import { renderFilterBar } from "./filter-bar";
import { renderStaleBanner } from "./stale-banner";
import { renderStatusBadges } from "./transport-source-badge";
import { renderUnplacedPanel } from "./unplaced-instants-panel";
import type { ViewerState } from "./viewer-state";
import { NOTICES } from "./notices";

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
    this.state.scheduler?.viewClosed();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("hcv-root");

    renderFilterBar(root, this.state);
    renderStaleBanner(root, this.state.freshnessEntries());

    const snapshots = this.state.filteredSnapshots();
    if (snapshots.length === 0) {
      root.createEl("p", { cls: "hcv-empty", text: NOTICES.noSelection });
      return;
    }

    const statusList = root.createDiv({ cls: "hcv-source-list" });
    for (const group of groupSourceStatuses(snapshots, (key) => this.state.ledgerOf(key))) {
      const alias = statusList.createDiv({ cls: "hcv-source-alias" });
      alias.createEl("h3", { cls: "hcv-source-alias-heading", text: group.alias });
      for (const cluster of group.clusters) {
        const item = alias.createDiv({ cls: "hcv-source" });
        const profiles = item.createDiv({ cls: "hcv-source-profiles" });
        for (const profileId of cluster.profileIds) {
          profiles.createSpan({ cls: "hcv-source-profile", text: profileId });
        }
        renderStatusBadges(item, cluster.snapshot, cluster.ledger);
      }
    }

    const { column, unplaced } = buildTodayColumn(this.state.filteredJobs(), Date.now());
    root.createEl("h3", { cls: "hcv-day-title", text: column.dayKey });

    // Entries are rendered inside their own hour row, so position needs no runtime style.
    const axis = root.createDiv({ cls: "hcv-axis" });
    const slots: HTMLElement[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const row = axis.createDiv({ cls: "hcv-hour" });
      row.createSpan({ cls: "hcv-hour-label", text: `${String(hour).padStart(2, "0")}:00` });
      slots.push(row.createDiv({ cls: "hcv-hour-slot" }));
    }

    for (const entry of column.entries) {
      const slot = slots[Math.floor(entry.minutesOfDay / 60)];
      if (slot !== undefined) this.renderEntry(slot, entry);
    }

    if (column.entries.length === 0) {
      root.createEl("p", {
        cls: "hcv-empty",
        text: "No Hermes-stated run instants fall on today for the current filter.",
      });
    }

    renderUnplacedPanel(root, unplaced);
  }

  private renderEntry(parent: HTMLElement, entry: PlacedEntry): void {
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
    block.dataset.jobId = entry.job.id;
    makeActivatable(block, () => this.openDetail(entry.job));
  }
}
