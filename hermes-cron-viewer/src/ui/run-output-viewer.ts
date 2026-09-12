import type { VerbatimEntry } from "../types/snapshot";
import { NOTICES } from "./notices";

/**
 * Render a body exactly as Hermes stored it.
 *
 * Text nodes only, so remote content can never be interpreted as markup. Nothing is summarized,
 * reformatted or sent anywhere: this is a viewer, not a generator.
 */
export function renderVerbatimBody(
  parent: HTMLElement,
  title: string,
  entry: VerbatimEntry | undefined,
): void {
  const block = parent.createDiv({ cls: "hcv-verbatim-block" });
  block.createEl("h4", { cls: "hcv-verbatim-title", text: title });

  if (entry === undefined) {
    block.createEl("p", { cls: "hcv-evidence-empty", text: NOTICES.bodyUnavailable });
    return;
  }

  if (entry.capExceeded) {
    block.createEl("p", {
      cls: "hcv-evidence-empty",
      text: "Response bound reached; the safe prefix below is shown and the rest was not accepted.",
    });
  }

  // `text` sets a text node; no markup path exists for remote content.
  block.createEl("pre", { cls: "hcv-verbatim", text: entry.body });
}

/** Optional single-line body, used for short native fields such as an error string. */
export function renderVerbatimLine(
  parent: HTMLElement,
  label: string,
  value: string | null,
): void {
  if (value === null || value.trim() === "") return;
  const row = parent.createDiv({ cls: "hcv-verbatim-line" });
  row.createSpan({ cls: "hcv-verbatim-label", text: label });
  row.createEl("pre", { cls: "hcv-verbatim", text: value });
}
