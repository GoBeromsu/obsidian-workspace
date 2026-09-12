import type { LedgerReadResult, SourceSnapshot } from "../types/snapshot";
import { encodeSourceKey } from "../types/snapshot";

interface SourceStatusCluster {
  readonly profileIds: readonly string[];
  readonly snapshot: SourceSnapshot;
  readonly ledger: LedgerReadResult | undefined;
  readonly lastUpdatedAt: string | null;
}

interface AliasStatusGroup {
  readonly alias: string;
  readonly clusters: readonly SourceStatusCluster[];
}

interface MutableCluster {
  readonly key: string;
  readonly profileIds: string[];
  snapshot: SourceSnapshot;
  ledger: LedgerReadResult | undefined;
  lastUpdatedAt: string | null;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function statusKey(snapshot: SourceSnapshot, ledger: LedgerReadResult | undefined): string {
  return JSON.stringify([
    snapshot.transport,
    snapshot.sourceStatus,
    snapshot.statusDetail,
    ledger !== undefined,
    ledger?.status ?? null,
    ledger?.detail ?? null,
    ledger?.status === "read" ? ledger.rows.length : null,
  ]);
}

function isNewer(candidate: string | null, current: string | null): boolean {
  if (candidate === null) return false;
  if (current === null) return true;
  return Date.parse(candidate) > Date.parse(current);
}

/** Groups profiles only when every user-visible status axis is identical. */
export function groupSourceStatuses(
  snapshots: readonly SourceSnapshot[],
  ledgerFor: (encodedSourceKey: string) => LedgerReadResult | undefined,
): readonly AliasStatusGroup[] {
  const aliases = new Map<string, MutableCluster[]>();
  const ordered = [...snapshots].sort((left, right) =>
    compareText(left.source.alias, right.source.alias)
    || compareText(left.source.profileId, right.source.profileId));

  for (const snapshot of ordered) {
    const ledger = ledgerFor(encodeSourceKey(snapshot.source));
    const key = statusKey(snapshot, ledger);
    const clusters = aliases.get(snapshot.source.alias) ?? [];
    const cluster = clusters.find((candidate) => candidate.key === key);

    if (cluster === undefined) {
      clusters.push({
        key,
        profileIds: [snapshot.source.profileId],
        snapshot,
        ledger,
        lastUpdatedAt: snapshot.lastUpdatedAt,
      });
      aliases.set(snapshot.source.alias, clusters);
      continue;
    }

    cluster.profileIds.push(snapshot.source.profileId);
    if (isNewer(snapshot.lastUpdatedAt, cluster.lastUpdatedAt)) {
      cluster.snapshot = snapshot;
      cluster.ledger = ledger;
      cluster.lastUpdatedAt = snapshot.lastUpdatedAt;
    }
  }

  return [...aliases].map(([alias, clusters]) => ({
    alias,
    clusters: clusters.map(({ profileIds, snapshot, ledger, lastUpdatedAt }) => ({
      profileIds,
      snapshot,
      ledger,
      lastUpdatedAt,
    })),
  }));
}
