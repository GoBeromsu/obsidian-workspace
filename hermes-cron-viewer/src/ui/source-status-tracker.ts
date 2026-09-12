import type { FreshnessState, LedgerReadResult, SourceSnapshot } from "../types/snapshot";
import { decodeSourceKey, encodeSourceKey } from "../types/snapshot";
import { INITIAL_FRESHNESS, reduceFreshness } from "../domain/freshness-reducer";
import { isUsableRead } from "../domain/read-usability";

/** Per-source freshness and ledger availability, keyed by encoded source key. */
export class SourceStatusTracker {
  private readonly freshness = new Map<string, FreshnessState>();
  private readonly ledgers = new Map<string, LedgerReadResult>();

  freshnessOf(encodedKey: string): FreshnessState {
    return this.freshness.get(encodedKey) ?? INITIAL_FRESHNESS;
  }

  ledgerOf(encodedKey: string): LedgerReadResult | undefined {
    return this.ledgers.get(encodedKey);
  }

  entries(): readonly { label: string; state: FreshnessState }[] {
    return [...this.freshness.entries()].map(([key, state]) => {
      const source = decodeSourceKey(key);
      return { label: `${source.alias} / ${source.profileId}`, state };
    });
  }

  /** Record the outcome of one round for one source. */
  record(snapshot: SourceSnapshot, ledger: LedgerReadResult): void {
    const key = encodeSourceKey(snapshot.source);
    this.ledgers.set(key, ledger);
    const previous = this.freshnessOf(key);
    this.freshness.set(
      key,
      isUsableRead(snapshot)
        ? reduceFreshness(previous, {
            kind: "success",
            at: snapshot.lastUpdatedAt ?? new Date().toISOString(),
            sourceStatus: snapshot.sourceStatus,
            detail: snapshot.statusDetail,
          })
        : reduceFreshness(previous, {
            kind: "failure",
            transport: snapshot.transport,
            detail: snapshot.statusDetail,
          }),
    );
  }

  /** Seed a restored source as stale: cached content is not a live read. */
  seedRestored(snapshot: SourceSnapshot): void {
    this.freshness.set(
      encodeSourceKey(snapshot.source),
      reduceFreshness(
        { ...INITIAL_FRESHNESS, lastUpdatedAt: snapshot.lastUpdatedAt },
        {
          kind: "failure",
          transport: "disconnected",
          detail: "Restored from cache; not refreshed yet.",
        },
      ),
    );
  }
}
