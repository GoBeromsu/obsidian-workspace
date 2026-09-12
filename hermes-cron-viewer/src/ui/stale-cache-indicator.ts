import { setIcon } from "obsidian";
import type { FreshnessState } from "../types/snapshot";
import type { SourceKey } from "../types/hermes-cron";
import { TRANSPORT_LABEL } from "./notices";

/** One tracked source freshness record, exactly as `ViewerState.freshnessEntries()` states it. */
export interface FreshnessEntry {
  readonly label: string;
  readonly state: FreshnessState;
}

/** Tracker label for a source key; must match `SourceStatusTracker.entries()`. */
export function freshnessLabel(source: SourceKey): string {
  return `${source.alias} / ${source.profileId}`;
}

/** Stale records among the sources currently visible under the filter, in tracker order. */
export function visibleStaleEntries(
  entries: readonly FreshnessEntry[],
  visibleLabels: ReadonlySet<string>,
): readonly FreshnessEntry[] {
  return entries.filter((entry) => entry.state.stale && visibleLabels.has(entry.label));
}

function lastReadText(stale: readonly FreshnessEntry[]): string {
  let oldest: number | null = null;
  let missing = false;
  for (const entry of stale) {
    const at = entry.state.lastUpdatedAt;
    if (at === null) {
      missing = true;
      continue;
    }
    const ms = Date.parse(at);
    if (Number.isNaN(ms)) continue;
    if (oldest === null || ms < oldest) oldest = ms;
  }
  if (oldest === null) return "never successfully read";
  const when = new Date(oldest).toLocaleString();
  return missing ? `oldest read ${when}, one source never read` : `last read ${when}`;
}

function causeText(stale: readonly FreshnessEntry[]): string {
  const causes: string[] = [];
  for (const entry of stale) {
    const cause = entry.state.detail ?? TRANSPORT_LABEL[entry.state.transport];
    if (!causes.includes(cause)) causes.push(cause);
  }
  return causes.length === 0 ? "unknown cause" : causes.join("; ");
}

/**
 * Tooltip for the cached-content icon.
 *
 * States that the schedule on screen is cached, when it was actually read and why the refresh
 * failed. Source aliases and profile names are deliberately left out: this is a freshness hint,
 * not a connection status wall (diagnostics live in settings).
 */
export function staleCacheTitle(stale: readonly FreshnessEntry[]): string {
  const scope = stale.length === 1 ? "1 visible source" : `${stale.length} visible sources`;
  return `Showing cached schedule: ${scope} not refreshed (${lastReadText(stale)}). Cause: ${causeText(stale)}`;
}

/**
 * Small cache icon next to the day title, rendered only while a visible source is stale.
 *
 * Returns `null` when everything visible is fresh, so a healthy timeline shows no chrome at all.
 */
export function renderStaleCacheIcon(
  parent: HTMLElement,
  entries: readonly FreshnessEntry[],
  visibleLabels: ReadonlySet<string>,
): HTMLElement | null {
  const stale = visibleStaleEntries(entries, visibleLabels);
  if (stale.length === 0) return null;
  const title = staleCacheTitle(stale);
  const icon = parent.createSpan({
    cls: "hcv-stale-cache",
    attr: { "aria-label": title, title, role: "img" },
  });
  setIcon(icon, "cloud-off");
  return icon;
}
