import type { FreshnessState } from "../types/snapshot";
import { freshnessSummary } from "../domain/freshness-reducer";
import { TRANSPORT_LABEL } from "./notices";

/**
 * Banner for sources whose last round failed.
 *
 * Content stays on screen; this states that it is old and why, so a stale schedule is never
 * mistaken for a current one.
 */
export function renderStaleBanner(
  parent: HTMLElement,
  entries: readonly { readonly label: string; readonly state: FreshnessState }[],
): void {
  const stale = entries.filter((entry) => entry.state.stale);
  if (stale.length === 0) return;

  const banner = parent.createDiv({ cls: "hcv-stale" });
  banner.createSpan({
    cls: "hcv-stale-title",
    text: `${stale.length} source(s) not refreshed`,
  });

  const list = banner.createEl("ul", { cls: "hcv-stale-list" });
  for (const entry of stale) {
    const item = list.createEl("li", { cls: "hcv-stale-item" });
    item.createSpan({ cls: "hcv-stale-source", text: entry.label });
    item.createSpan({ cls: "hcv-stale-reason", text: TRANSPORT_LABEL[entry.state.transport] });
    item.createSpan({ cls: "hcv-stale-detail", text: freshnessSummary(entry.state) });
  }
}
