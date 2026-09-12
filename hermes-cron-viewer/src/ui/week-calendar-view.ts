import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { CronJobRecord } from "../types/hermes-cron";
import { JobDetailModal } from "./job-detail-modal";
import { buildWeekGrid } from "../domain/week-grid-builder";
import type { DayColumn, PlacedEntry, RuleChip } from "../types/view";
import { groupSourceStatuses } from "../domain/source-status-groups";
import { renderFilterBar } from "./filter-bar";
import { renderStaleBanner } from "./stale-banner";
import { renderStatusBadges } from "./transport-source-badge";
import { renderUnplacedPanel } from "./unplaced-instants-panel";
import type { ViewerState } from "./viewer-state";
import { NOTICES } from "./notices";

export const WEEK_CALENDAR_VIEW = "hermes-cron-week-calendar";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const RULE_LAYER_NOTE =
  "Solid chips are run instants Hermes stated (next run / last run). Outlined chips are projected " +
  "from the schedule rule only - they are not evidence that a run happened and carry no status. " +
  "Projections use local calendar time; unanchored interval schedules are not expanded, so no " +
  "anchored times are fabricated for them.";

/** Makes a chip reachable and actionable by keyboard, matching its click action. */
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

/**
 * Weekly calendar: an hour gutter on the left and seven day columns, laid out as one CSS grid.
 *
 * Every chip sits inside the day-hour cell it belongs to, so no runtime positioning is needed.
 */
export class WeekCalendarView extends ItemView {
  private unsubscribe: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly state: ViewerState) {
    super(leaf);
  }

  override getViewType(): string {
    return WEEK_CALENDAR_VIEW;
  }

  override getDisplayText(): string {
    return "Hermes: Week";
  }

  override getIcon(): string {
    return "calendar-days";
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
    root.addClass("hcv-root", "hcv-week-root");

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

    const grid = buildWeekGrid(this.state.filteredJobs(), Date.now());
    const scroll = root.createDiv({ cls: "hcv-week-scroll" });
    const calendar = scroll.createDiv({ cls: "hcv-week-cal" });

    calendar.createDiv({ cls: "hcv-week-corner" }).createSpan({
      cls: "hcv-week-corner-label",
      text: "Time",
    });
    for (const day of grid.days) this.renderDayHead(calendar, day);

    for (let hour = 0; hour < 24; hour += 1) {
      calendar.createDiv({ cls: "hcv-week-gutter" }).createSpan({
        cls: "hcv-week-hour-label",
        text: `${String(hour).padStart(2, "0")}:00`,
      });
      for (const day of grid.days) {
        const cell = calendar.createDiv({
          cls: day.isToday ? "hcv-week-cell hcv-week-cell-today" : "hcv-week-cell",
        });
        const slot = day.hours[hour];
        if (slot === undefined) continue;
        for (const entry of slot.entries) this.renderStated(cell, entry);
        for (const chip of slot.ruleChips) this.renderRuleChip(cell, chip);
      }
    }

    const legend = root.createEl("details", { cls: "hcv-week-legend" });
    legend.createEl("summary", { text: "Schedule legend" });
    legend.createEl("p", { cls: "hcv-week-note", text: RULE_LAYER_NOTE });

    renderUnplacedPanel(root, grid.unplaced);
  }

  private renderDayHead(calendar: HTMLElement, day: DayColumn): void {
    const head = calendar.createDiv({
      cls: day.isToday ? "hcv-week-head hcv-week-head-today" : "hcv-week-head",
    });
    head.createSpan({ cls: "hcv-week-weekday", text: WEEKDAY_NAMES[day.weekdayIndex] ?? "" });
    head.createSpan({ cls: "hcv-week-date", text: day.dayKey.slice(5) });
    head.createSpan({ cls: "hcv-week-count", text: String(day.entries.length) });
    if (day.ruleCount > 0) {
      head.createSpan({ cls: "hcv-week-rule-count", text: `+${day.ruleCount}` });
    }
    head.setAttribute(
      "aria-label",
      `${day.dayKey}: ${day.entries.length} stated instants, ${day.ruleCount} projected from rules`,
    );
  }

  private renderStated(cell: HTMLElement, entry: PlacedEntry): void {
    const name = entry.job.name ?? entry.job.id;
    const chip = cell.createDiv({ cls: `hcv-week-chip hcv-chip-stated hcv-chip-${entry.origin}` });
    chip.createSpan({ cls: "hcv-chip-time", text: entry.localClock });
    chip.createSpan({ cls: "hcv-chip-name", text: name });
    const label = `${entry.localClock} ${name} - ${
      entry.origin === "next_run_at" ? "next run" : "last run"
    } stated by Hermes (${entry.raw})`;
    chip.setAttribute("aria-label", label);
    chip.setAttribute("title", `${label}\n${entry.job.source.alias}/${entry.job.source.profileId}`);
    chip.dataset.jobId = entry.job.id;
    makeActivatable(chip, () => this.openDetail(entry.job));
  }

  /** Rule projection: cadence text only, no status, no duration, no execution record. */
  private renderRuleChip(cell: HTMLElement, chip: RuleChip): void {
    const name = chip.job.name ?? chip.job.id;
    const block = cell.createDiv({ cls: "hcv-week-chip hcv-chip-rule" });
    if (!chip.collapsed) {
      block.createSpan({ cls: "hcv-chip-time", text: chip.clocks[0] ?? "" });
    }
    block.createSpan({ cls: "hcv-chip-name", text: name });
    if (chip.collapsed) {
      block.createSpan({ cls: "hcv-chip-count", text: `\u00d7${chip.count}` });
    }
    const label = `${name} - from schedule rule ${chip.rule} (${chip.cadence}); ${
      chip.collapsed ? `${chip.count} projected times` : "projected time"
    }: ${chip.clocks.join(", ")}. Not a run record. ${chip.job.source.alias}/${
      chip.job.source.profileId
    }`;
    block.setAttribute("aria-label", label);
    block.setAttribute("title", label);
    block.dataset.jobId = chip.job.id;
    block.dataset.origin = chip.origin;
    makeActivatable(block, () => this.openDetail(chip.job));
  }
}
