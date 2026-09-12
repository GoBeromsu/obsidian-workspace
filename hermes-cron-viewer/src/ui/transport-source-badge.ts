import { setIcon } from "obsidian";
import type { LedgerReadResult, SourceSnapshot } from "../types/snapshot";
import { SOURCE_LABEL, TRANSPORT_LABEL } from "./notices";

/**
 * Colour-first state indicator: a tone dot plus an axis icon.
 *
 * Every axis keeps its own icon, so colour is never the only carrier of meaning. `text` is
 * rendered visibly only when the state must stay readable without hovering; a healthy state keeps
 * its full sentence in `title`/`aria-label` instead of printing it.
 *
 * A failing axis that carries `detail` becomes its own disclosure: the summary is that axis'
 * icon plus its short cause, and expanding it shows the exact verbatim failure text. There is no
 * shared, generic status marker - every cause hangs off the axis it belongs to.
 */
export function renderStateIndicator(
  parent: HTMLElement,
  spec: {
    readonly icon: string;
    readonly tone: "healthy" | "failure" | "neutral";
    readonly sentence: string;
    readonly text: string | null;
    readonly detail?: string | null;
  },
): void {
  const detail = spec.detail ?? null;
  const expandable = spec.tone === "failure" && detail !== null;
  const cls = `hcv-state hcv-state-${spec.tone}`;

  if (expandable) {
    const details = parent.createEl("details", { cls: "hcv-state-disclosure" });
    const summary = details.createEl("summary", {
      cls,
      attr: { "aria-label": spec.sentence, title: spec.sentence },
    });
    paintChip(summary, spec);
    details.createDiv({ cls: "hcv-state-detail", text: detail });
    return;
  }

  // Not expandable: still keyboard reachable so the full sentence can be read without a pointer.
  const chip = parent.createSpan({
    cls,
    attr: { "aria-label": spec.sentence, title: spec.sentence, tabindex: "0", role: "note" },
  });
  paintChip(chip, spec);
}

function paintChip(
  chip: HTMLElement,
  spec: { readonly icon: string; readonly text: string | null },
): void {
  const dot = chip.createSpan({ cls: "hcv-state-dot" });
  dot.setAttribute("aria-hidden", "true");
  setIcon(chip.createSpan({ cls: "hcv-state-icon" }), spec.icon);
  // A failing axis always prints its short cause; only a healthy one is hover-only.
  if (spec.text !== null) chip.createSpan({ cls: "hcv-state-text", text: spec.text });
}

/**
 * Render the independent status axes for one source.
 *
 * The transport axis describes the SSH connection, the source axis describes the native data.
 * The connection axis' own tooltip states that it never probes remote Hermes gateway liveness, so
 * that caveat lives where it applies instead of in a standalone marker.
 */
export function renderStatusBadges(
  parent: HTMLElement,
  snapshot: SourceSnapshot,
  ledger?: LedgerReadResult,
): void {
  const row = parent.createDiv({ cls: "hcv-badges" });

  const transportLabel = TRANSPORT_LABEL[snapshot.transport];
  const connected = snapshot.transport === "connected";
  const liveness = "SSH transport only; remote Hermes gateway liveness is not checked.";
  renderStateIndicator(row, {
    icon: "plug-zap",
    tone: connected ? "healthy" : "failure",
    sentence: connected
      ? `Connection: ${transportLabel}. ${liveness}`
      : `Connection failed: ${transportLabel}${detailSuffix(snapshot.statusDetail)}. ${liveness}`,
    text: connected ? null : transportLabel,
    detail: connected ? null : snapshot.statusDetail,
  });

  const sourceStatusLabel = SOURCE_LABEL[snapshot.sourceStatus];
  const readOk = snapshot.sourceStatus === "read";
  // When the transport already failed it owns `statusDetail`; the data axis must not repeat it.
  const dataDetail = readOk || !connected ? null : snapshot.statusDetail;
  renderStateIndicator(row, {
    icon: "database",
    tone: readOk ? "healthy" : "failure",
    sentence: readOk
      ? `Data: ${sourceStatusLabel}`
      : `Data read failed: ${sourceStatusLabel}${detailSuffix(dataDetail)}`,
    text: readOk ? null : sourceStatusLabel,
    detail: dataDetail,
  });

  if (snapshot.lastUpdatedAt !== null) {
    const updatedAt = new Date(snapshot.lastUpdatedAt);
    renderStateIndicator(row, {
      icon: "clock-3",
      tone: "neutral",
      sentence: `Data last refreshed at ${updatedAt.toLocaleString()}`,
      text: null,
    });
  }

  if (ledger !== undefined) {
    const ledgerOk = ledger.status === "read";
    const historyLabel = ledgerOk ? `${ledger.rows.length} row(s)` : SOURCE_LABEL[ledger.status];
    // A degraded ledger keeps its short label on screen; the exact cause sits in the disclosure.
    renderStateIndicator(row, {
      icon: "history",
      tone: ledgerOk ? "healthy" : "failure",
      sentence: ledgerOk
        ? `History: ${historyLabel} available`
        : `History read failed: ${historyLabel}${detailSuffix(ledger.detail)}`,
      text: ledgerOk ? null : historyLabel,
      detail: ledgerOk ? null : ledger.detail,
    });
  }
}

/** ` - <cause>` when a cause exists, so a title states the actual problem, not a generic hint. */
function detailSuffix(detail: string | null): string {
  return detail === null ? "" : ` - ${detail}`;
}

/** One-line source label, e.g. `m1-file / default` or `m1-file / xia`. */
export function sourceLabel(snapshot: SourceSnapshot): string {
  return `${snapshot.source.alias} / ${snapshot.source.profileId}`;
}
