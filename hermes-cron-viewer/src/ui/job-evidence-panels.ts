import type { ExecutionRow, OutputFileIndex } from "../types/hermes-cron";
import type { LedgerReadResult } from "../types/snapshot";
import { SOURCE_LABEL } from "./notices";
import { renderStateIndicator } from "./transport-source-badge";
import { executionStatusView } from "../domain/run-status-view-model";

const TONE = { success: "healthy", failure: "failure", neither: "neutral" } as const;
const TALLY_ICON = { success: "circle-check", failure: "circle-x", neither: "circle-help" } as const;

/**
 * Render only the execution ledger, newest first, exactly in the native query order.
 *
 * The ledger and the output files stay separate renderers: the native schema has no column
 * linking a ledger row to an output file, so they are never merged or paired.
 */
export function renderLedgerPanel(
  parent: HTMLElement,
  ledger: LedgerReadResult,
  onLoadMore: (() => void) | null,
  pageError: string | null,
): void {
  if (ledger.status !== "read") {
    renderLedgerUnavailable(parent, ledger);
    return;
  }

  if (ledger.rows.length === 0) {
    parent.createEl("p", {
      cls: "hcv-evidence-empty",
      text: "Not in the current query window. This is not proof that no history exists.",
    });
    return;
  }

  const list = parent.createEl("ul", { cls: "hcv-evidence-list" });
  for (const row of ledger.rows) {
    renderLedgerRow(list.createEl("li", { cls: "hcv-evidence-item" }), row);
  }

  if (pageError !== null) {
    parent.createEl("p", {
      cls: "hcv-evidence-empty",
      text: `Older rows could not be loaded: ${pageError}`,
    });
  }

  if (ledger.windowLimited && onLoadMore !== null) {
    const more = parent.createEl("button", {
      cls: "hcv-evidence-more",
      text: pageError === null ? "Load older rows" : "Retry older rows",
    });
    more.addEventListener("click", onLoadMore);
  }
}

/**
 * A history read that did not succeed.
 *
 * The short sentence says only what is observable: this read failed and the other evidence is
 * unaffected. It never claims the history is missing, corrupted or a WAL problem, because a
 * failing read alone does not establish a cause. The exact native message stays available, byte
 * for byte, behind a native disclosure instead of a wall of raw error text.
 */
function renderLedgerUnavailable(parent: HTMLElement, ledger: LedgerReadResult): void {
  const block = parent.createDiv({ cls: "hcv-evidence-unavailable" });
  block.createEl("h4", { cls: "hcv-evidence-heading", text: SOURCE_LABEL[ledger.status] });
  block.createEl("p", {
    cls: "hcv-evidence-empty",
    text: "The execution log could not be read. Schedules and output files are still available.",
  });
  const detail = ledger.detail;
  if (detail === null || detail.trim() === "") return;
  const details = block.createEl("details", { cls: "hcv-disclosure" });
  details.createEl("summary", { cls: "hcv-disclosure-summary", text: "Technical details" });
  // `text` sets a text node: the native message is shown exactly, never reworded.
  details.createEl("pre", { cls: "hcv-verbatim", text: detail });
}

function renderLedgerRow(item: HTMLElement, row: ExecutionRow): void {
  const view = executionStatusView(row);
  const head = item.createDiv({ cls: "hcv-evidence-head" });
  head.createSpan({ cls: "hcv-evidence-time", text: row.claimedAt ?? "no claim time" });
  // A completed row is colour-first; every other outcome keeps its wording on screen.
  renderStateIndicator(head, {
    icon: TALLY_ICON[view.execution.tally],
    tone: TONE[view.execution.tally],
    sentence: `Execution: ${view.execution.label}`,
    text: view.execution.tally === "success" ? null : view.execution.label,
  });
  if (view.execution.raw !== null) {
    head.createSpan({ cls: "hcv-status-raw", text: view.execution.raw });
  }
  head.createSpan({ cls: "hcv-evidence-id", text: row.id });
  item.createSpan({ cls: "hcv-evidence-delivery", text: `Delivery: ${view.delivery.label}` });
  if (row.error !== null && row.error.trim() !== "") {
    item.createEl("pre", { cls: "hcv-verbatim", text: row.error });
  }
}

/**
 * Render only the output file selector, in the existing index order, never paired to a row.
 *
 * Returns the list element so the caller can keep the reading position across a reader visit.
 */
export function renderOutputPanel(
  parent: HTMLElement,
  outputs: OutputFileIndex,
  onSelect: (fileName: string) => void,
  outputError: string | null,
): HTMLElement | null {
  if (outputError !== null) {
    // A failed listing is reported as a failure, never as "there are no files".
    parent.createEl("p", { cls: "hcv-evidence-empty", text: `Could not list output files: ${outputError}` });
    return null;
  }
  let listEl: HTMLElement | null = null;
  if (outputs.files.length === 0) {
    parent.createEl("p", { cls: "hcv-evidence-empty", text: "No output files listed." });
  } else {
    const list = parent.createEl("ul", { cls: "hcv-evidence-list" });
    listEl = list;
    for (const file of outputs.files) {
      const item = list.createEl("li", { cls: "hcv-evidence-item" });
      const button = item.createEl("button", { cls: "hcv-output-button", text: file.fileName });
      button.addEventListener("click", () => onSelect(file.fileName));
    }
  }

  if (outputs.rejectedCount > 0) {
    parent.createEl("p", {
      cls: "hcv-evidence-empty",
      text: `${outputs.rejectedCount} file name(s) outside the supported name format are not shown.`,
    });
  }
  return listEl;
}
