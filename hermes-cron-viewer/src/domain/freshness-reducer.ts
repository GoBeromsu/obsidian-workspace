import type { FreshnessEvent, FreshnessState } from "../types/snapshot";

export const INITIAL_FRESHNESS: FreshnessState = {
  transport: "disconnected",
  sourceStatus: "file-missing",
  lastUpdatedAt: null,
  stale: false,
  detail: null,
};

/**
 * Pure per-source freshness transition.
 *
 * A failed round never clears the last successful content or its timestamp: the view keeps showing
 * what was last read, flagged stale with the disconnect reason. Recovery clears the flag and moves
 * the timestamp forward. Each source has its own state, so one dead server cannot mark a healthy
 * sibling stale.
 */
export function reduceFreshness(state: FreshnessState, event: FreshnessEvent): FreshnessState {
  if (event.kind === "success") {
    return {
      transport: "connected",
      sourceStatus: event.sourceStatus,
      lastUpdatedAt: event.at,
      stale: false,
      detail: event.detail,
    };
  }

  return {
    transport: event.transport,
    sourceStatus: state.sourceStatus,
    // Preserved on purpose: this is when the shown content was actually read.
    lastUpdatedAt: state.lastUpdatedAt,
    stale: true,
    detail: event.detail,
  };
}

/** Human summary for the stale banner. */
export function freshnessSummary(state: FreshnessState): string {
  if (!state.stale) {
    return state.lastUpdatedAt === null
      ? "Not read yet"
      : `Updated ${new Date(state.lastUpdatedAt).toLocaleTimeString()}`;
  }
  const when = state.lastUpdatedAt === null
    ? "never successfully read"
    : `last read ${new Date(state.lastUpdatedAt).toLocaleTimeString()}`;
  return `Disconnected (${state.detail ?? state.transport}); showing content from ${when}`;
}
