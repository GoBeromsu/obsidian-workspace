import type { PersistedSourceSnapshot, PersistedStore, ViewerSettings } from "../types/snapshot";
import type { PluginDataGateway } from "./plugin-data-gateway";

const MAX_BYTES_PER_SNAPSHOT = 256 * 1024;

interface PluginData {
  settings?: Partial<ViewerSettings>;
  remoteHomes?: Record<string, string>;
  store?: PersistedStore;
}

/**
 * Persists the allow-listed projection under the vault config folder.
 *
 * Exactly one snapshot per selected source is kept, so the file cannot accumulate history. There
 * is deliberately no time-based expiry: the whole point of the cache is to still show the last
 * known schedule while a server is unreachable. Removal is explicit - deselecting a source, adding
 * a server, or clearing the cache.
 */
export class SnapshotDiskStore {
  constructor(private readonly gateway: PluginDataGateway) {}

  async load(): Promise<readonly PersistedSourceSnapshot[]> {
    const data = await this.gateway.read<PluginData & Record<string, unknown>>();
    return data.store?.snapshots ?? [];
  }

  /** Replace the snapshot for each given source; unrelated sources are untouched. */
  async save(snapshots: readonly PersistedSourceSnapshot[]): Promise<void> {
    const incomingKeys = new Set(
      snapshots.map((snapshot) => `${snapshot.alias}\u0000${snapshot.profileId}`),
    );
    await this.write((existing) => [
      ...existing.filter(
        (snapshot) => !incomingKeys.has(`${snapshot.alias}\u0000${snapshot.profileId}`),
      ),
      ...snapshots.filter((snapshot) => withinBudget(snapshot)),
    ]);
  }

  async remove(alias: string, profileId: string): Promise<void> {
    await this.write((existing) =>
      existing.filter((snapshot) => !(snapshot.alias === alias && snapshot.profileId === profileId)),
    );
  }

  async removeServer(alias: string): Promise<void> {
    await this.write((existing) => existing.filter((snapshot) => snapshot.alias !== alias));
  }

  async clear(): Promise<void> {
    await this.write(() => []);
  }

  private async write(
    mutate: (existing: readonly PersistedSourceSnapshot[]) => readonly PersistedSourceSnapshot[],
  ): Promise<void> {
    await this.gateway.update<PluginData & Record<string, unknown>>((data) => ({
      ...data,
      store: { version: 1, snapshots: [...mutate(data.store?.snapshots ?? [])] },
    }));
  }
}

/** Trim-by-refusal: an oversized snapshot is dropped rather than silently truncated mid-record. */
function withinBudget(snapshot: PersistedSourceSnapshot): boolean {
  return new TextEncoder().encode(JSON.stringify(snapshot)).byteLength <= MAX_BYTES_PER_SNAPSHOT;
}
