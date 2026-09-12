import { setIcon } from "obsidian";
import type { CronJobRecord } from "../types/hermes-cron";
import type { JobTabId } from "../types/view";
import { jobStatusView } from "../domain/run-status-view-model";
import { formatOverviewInstant } from "../domain/overview-instant";
import { renderStateIndicator } from "./transport-source-badge";
import { renderVerbatimLine } from "./run-output-viewer";

/** Icon-first, one short English word per section. Order is also the keyboard order. */
export const JOB_TABS: readonly { readonly id: JobTabId; readonly label: string; readonly icon: string }[] = [
  { id: "overview", label: "Overview", icon: "layout-dashboard" },
  { id: "history", label: "History", icon: "history" },
  { id: "output", label: "Output", icon: "file-text" },
];

const TONE = { success: "healthy", failure: "failure", neither: "neutral" } as const;
const TALLY_ICON = { success: "circle-check", failure: "circle-x", neither: "circle-help" } as const;

/** A body is kept inline while it stays short; anything longer becomes a native disclosure. */
const INLINE_LIMIT = 120;

/**
 * Native tablist for the job detail sections.
 *
 * Real `button` elements with `role="tab"`/`aria-selected`, roving `tabindex`, and arrow/Home/End
 * keys, so the sections are reachable without a pointer. Only the selected panel is rendered.
 */
export function renderJobTabs(
  parent: HTMLElement,
  active: JobTabId,
  onSelect: (id: JobTabId, fromKeyboard: boolean) => void,
  focusActive: boolean,
): void {
  const bar = parent.createDiv({
    cls: "hcv-tabs",
    attr: { role: "tablist", "aria-label": "Job detail sections" },
  });

  JOB_TABS.forEach((tab, index) => {
    const selected = tab.id === active;
    const button = bar.createEl("button", {
      cls: selected ? "hcv-tab hcv-tab-active" : "hcv-tab",
      text: tab.label,
      attr: {
        type: "button",
        role: "tab",
        id: `hcv-tab-${tab.id}`,
        "aria-controls": `hcv-panel-${tab.id}`,
        "aria-selected": selected ? "true" : "false",
        tabindex: selected ? "0" : "-1",
      },
    });
    button.addEventListener("click", () => onSelect(tab.id, false));
    button.addEventListener("keydown", (event: KeyboardEvent) => {
      const key = event?.key;
      if (key === undefined) return;
      const next = keyboardTarget(key, index);
      if (next === null) return;
      event.preventDefault();
      onSelect(next, true);
    });
    setIcon(button.createSpan({ cls: "hcv-tab-icon" }), tab.icon);
    if (selected && focusActive && typeof button.focus === "function") button.focus();
  });
}

function keyboardTarget(key: string, index: number): JobTabId | null {
  const last = JOB_TABS.length - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return JOB_TABS[(index + 1) % JOB_TABS.length]!.id;
  if (key === "ArrowLeft" || key === "ArrowUp") return JOB_TABS[(index + last) % JOB_TABS.length]!.id;
  if (key === "Home") return JOB_TABS[0]!.id;
  if (key === "End") return JOB_TABS[last]!.id;
  return null;
}

/** The single content column. One panel exists at a time; there are no side-by-side columns. */
export function createJobPanel(parent: HTMLElement, active: JobTabId): HTMLElement {
  return parent.createDiv({
    cls: "hcv-panel",
    attr: {
      role: "tabpanel",
      id: `hcv-panel-${active}`,
      "aria-labelledby": `hcv-tab-${active}`,
      tabindex: "0",
    },
  });
}

/** Overview: the latest native status axes, the schedule facts, then the long native bodies. */
export function renderOverviewPanel(panel: HTMLElement, job: CronJobRecord): void {
  const view = jobStatusView(job);

  const row = panel.createDiv({ cls: "hcv-detail-status" });
  // Only a plain success is hover-only; anything else keeps its wording on screen.
  renderStateIndicator(row, {
    icon: TALLY_ICON[view.execution.tally],
    tone: TONE[view.execution.tally],
    sentence: `Execution: ${view.execution.label}`,
    text: view.execution.tally === "success" ? null : view.execution.label,
  });
  if (view.execution.raw !== null) row.createSpan({ cls: "hcv-status-raw", text: view.execution.raw });
  renderStateIndicator(row, {
    icon: "send",
    tone: TONE[view.delivery.tally],
    sentence: `Delivery: ${view.delivery.label}`,
    text: view.delivery.tally === "success" ? null : `Delivery: ${view.delivery.label}`,
  });

  const list = panel.createEl("dl", { cls: "hcv-facts" });
  fact(list, "Schedule", job.schedule.display ?? job.schedule.raw ?? "no schedule text");
  timeFact(list, "Next run", job.nextRunAt, "Not stated");
  timeFact(list, "Last run", job.lastRunAt, "No last run");
  const dispatch = job.lastDispatch;
  if (dispatch !== null) {
    if (dispatch.kind !== null) fact(list, "Dispatch", dispatch.kind);
    timeFact(list, "Dispatch scheduled", dispatch.scheduledAt, "Not stated");
    timeFact(list, "Dispatch ran", dispatch.dispatchedAt, "Not stated");
  }

  renderNativeBody(panel, "Prompt", job.prompt);
  renderNativeBody(panel, "Last error", job.lastError);
  renderNativeBody(panel, "Last delivery error", job.lastDeliveryError);
}

/** One `label / value` pair. Every native value keeps its own line. */
function fact(list: HTMLElement, label: string, value: string): void {
  list.createEl("dt", { cls: "hcv-fact-label", text: label });
  list.createEl("dd", { cls: "hcv-fact-value", text: value });
}

/**
 * A timestamp fact: a prominent local clock over a muted date/timezone line.
 *
 * A value without an explicit offset is never placed on a clock; it is shown as stored with
 * `Time zone unknown`. The exact stored text is always carried in the `title`.
 */
function timeFact(
  list: HTMLElement,
  label: string,
  raw: string | null,
  unavailable: string,
): void {
  const shown = formatOverviewInstant(raw, { unavailable });
  list.createEl("dt", { cls: "hcv-fact-label", text: label });
  const value = list.createEl("dd", { cls: "hcv-fact-value hcv-fact-time", attr: { title: shown.title } });
  if (shown.clock !== null) {
    value.createSpan({ cls: "hcv-fact-clock", text: shown.clock });
  } else if (shown.raw !== null) {
    value.createSpan({ cls: "hcv-fact-raw", text: shown.raw });
  }
  value.createSpan({ cls: "hcv-fact-context", text: shown.context });
}

/**
 * A native body, never rewritten or shortened.
 *
 * A short single-line value stays inline; a long one is folded into a `details` disclosure whose
 * `pre` still carries the exact stored text.
 */
export function renderNativeBody(parent: HTMLElement, label: string, value: string | null): void {
  if (value === null || value.trim() === "") return;
  if (value.length <= INLINE_LIMIT && !value.includes("\n")) {
    renderVerbatimLine(parent, label, value);
    return;
  }
  const details = parent.createEl("details", { cls: "hcv-disclosure" });
  details.createEl("summary", { cls: "hcv-disclosure-summary", text: label });
  // `text` sets a text node; remote content has no markup path.
  details.createEl("pre", { cls: "hcv-verbatim", text: value });
}
