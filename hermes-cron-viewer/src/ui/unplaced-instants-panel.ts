import type { UnplacedEntry } from "../types/view";

const REASON_LABEL: Record<UnplacedEntry["reason"], string> = {
  "timezone-unknown": "No timezone offset",
  unparsed: "Unrecognized timestamp",
};

/**
 * List instants that exist natively but cannot be positioned on a calendar.
 *
 * A timestamp without an offset has no determinable absolute instant, so placing it would require
 * inventing a timezone. The native text is shown verbatim instead.
 */
export function renderUnplacedPanel(
  parent: HTMLElement,
  unplaced: readonly UnplacedEntry[],
): void {
  if (unplaced.length === 0) return;

  const panel = parent.createDiv({ cls: "hcv-unplaced" });
  panel.createEl("h4", { text: `Not placed (${unplaced.length})`, cls: "hcv-unplaced-title" });
  panel.createEl("p", {
    cls: "hcv-unplaced-note",
    text: "These instants are shown exactly as Hermes stored them; they are not positioned on the calendar.",
  });

  const list = panel.createEl("ul", { cls: "hcv-unplaced-list" });
  for (const entry of unplaced) {
    const item = list.createEl("li", { cls: "hcv-unplaced-item" });
    item.createSpan({ cls: "hcv-unplaced-job", text: entry.job.name ?? entry.job.id });
    item.createSpan({ cls: "hcv-unplaced-origin", text: entry.origin });
    item.createSpan({ cls: "hcv-unplaced-raw", text: entry.raw });
    item.createSpan({ cls: "hcv-unplaced-reason", text: REASON_LABEL[entry.reason] ?? entry.reason });
  }
}
