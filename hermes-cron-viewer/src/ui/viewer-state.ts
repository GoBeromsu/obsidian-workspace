import type { ProfileRef, SourceKey } from "../types/hermes-cron";
import type {
  FreshnessState,
  LedgerReadResult,
  PersistedSourceSnapshot,
  SourceSnapshot,
  ViewerSettings,
} from "../types/snapshot";
import { decodeSourceKey, encodeSourceKey } from "../types/snapshot";
import { collectRound } from "./hermes-snapshot-collector";
import type { SshReadOnlyAdapter } from "./ssh-read-only-adapter";
import { VerbatimMemoryStore } from "./verbatim-memory-store";
import { projectSnapshot } from "../domain/snapshot-projection";
import { rehydrateSnapshot } from "../domain/snapshot-restore";
import { isUsableRead } from "../domain/read-usability";
import { SourceStatusTracker } from "./source-status-tracker";
import type { ViewerFilter } from "../types/view";
import { profileHome } from "../domain/profile-candidate-paths";
import type { Logger } from "../utils/logger";
import { emptyCounters } from "../utils/logger";

export const EMPTY_FILTER: ViewerFilter = { alias: null, profileId: null, text: "" };

type Listener = () => void;

/**
 * Shared read-only view state.
 *
 * Views subscribe and re-render; they never issue remote commands themselves, so the per-round
 * command budget stays owned by one place.
 */
export class ViewerState {
  private snapshots: SourceSnapshot[] = [];
  private readonly listeners = new Set<Listener>();
  private filter: ViewerFilter = EMPTY_FILTER;
  private refreshing = false;
  private remoteHomes = new Map<string, string>();
  private readonly status = new SourceStatusTracker();
  private persist: ((snapshots: readonly PersistedSourceSnapshot[]) => Promise<void>) | null = null;

  /** Bodies live here for the process lifetime only; nothing is written to disk. */
  readonly bodies = new VerbatimMemoryStore();
  /** Set by the plugin so views can drive the polling lifecycle. */
  scheduler: { viewOpened(): void; viewClosed(): void } | null = null;

  constructor(
    readonly adapter: SshReadOnlyAdapter,
    private settings: ViewerSettings,
    private readonly logger: Logger,
  ) {}

  /** Install the disk projection sink. Bodies never reach it: the projection drops them. */
  setPersistSink(sink: (snapshots: readonly PersistedSourceSnapshot[]) => Promise<void>): void {
    this.persist = sink;
  }

  /** Ledger availability for one encoded source key, as of the last round. */
  ledgerOf(encodedKey: string): LedgerReadResult | undefined {
    return this.status.ledgerOf(encodedKey);
  }

  /** Freshness for one encoded source key. */
  freshnessOf(encodedKey: string): FreshnessState {
    return this.status.freshnessOf(encodedKey);
  }

  freshnessEntries(): readonly { label: string; state: FreshnessState }[] {
    return this.status.entries();
  }

  /** Restore the last projection so an offline start still shows the last known schedule. */
  restore(persisted: readonly PersistedSourceSnapshot[]): void {
    this.snapshots = persisted.map(rehydrateSnapshot);
    // Restored content is not a live read: seed each source as stale so the banner shows before
    // the first successful round of this session.
    for (const snapshot of this.snapshots) this.status.seedRestored(snapshot);
    this.notifyAll();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyAll(): void {
    for (const listener of this.listeners) listener();
  }

  getSnapshots(): readonly SourceSnapshot[] {
    return this.snapshots;
  }

  getFilter(): ViewerFilter {
    return this.filter;
  }

  setFilter(filter: ViewerFilter): void {
    this.filter = filter;
    this.notifyAll();
  }

  getSettings(): ViewerSettings {
    return this.settings;
  }

  setSettings(settings: ViewerSettings): void {
    this.settings = settings;
    this.notifyAll();
  }

  isRefreshing(): boolean {
    return this.refreshing;
  }

  /** Remember a resolved remote `$HOME` so selected sources can be rebuilt without re-probing. */
  rememberHome(alias: string, remoteHome: string): void {
    this.remoteHomes.set(alias, remoteHome);
  }

  getRemoteHome(alias: string): string | undefined {
    return this.remoteHomes.get(alias);
  }

  /** Selected sources resolved back into concrete profile references. */
  selectedProfiles(): readonly ProfileRef[] {
    const profiles: ProfileRef[] = [];
    for (const encoded of this.settings.selectedSources) {
      const key = decodeSourceKey(encoded);
      const remoteHome = this.remoteHomes.get(key.alias);
      if (remoteHome === undefined) continue;
      profiles.push({
        alias: key.alias,
        profileId: key.profileId,
        home: profileHome(remoteHome, key.profileId),
      });
    }
    return profiles;
  }

  /** Snapshots matching the active server/profile filter. */
  filteredSnapshots(): readonly SourceSnapshot[] {
    const { alias, profileId } = this.filter;
    return this.snapshots
      .filter((snapshot) => alias === null || snapshot.source.alias === alias)
      .filter((snapshot) => profileId === null || snapshot.source.profileId === profileId);
  }

  /** Jobs across selected sources after the active filter. */
  filteredJobs() {
    const needle = this.filter.text.trim().toLowerCase();
    return this.filteredSnapshots()
      .flatMap((snapshot) => snapshot.jobs)
      .filter((job) => {
        if (needle === "") return true;
        const haystack = `${job.id} ${job.name ?? ""} ${job.schedule.display ?? ""}`.toLowerCase();
        return haystack.includes(needle);
      });
  }

  /** Run one collection round for every selected source. Never throws to the caller. */
  async refresh(): Promise<void> {
    if (this.refreshing) return;
    const profiles = this.selectedProfiles();
    if (profiles.length === 0) {
      this.snapshots = [];
      this.notifyAll();
      return;
    }

    this.refreshing = true;
    this.notifyAll();
    const counters = emptyCounters();
    const startedAt = Date.now();
    try {
      const collected = await collectRound(this.adapter, profiles, {
        historyLimit: this.settings.historyLimit,
      });
      // A failed source keeps its last successful content; only a successful read replaces it.
      const previousByKey = new Map(
        this.snapshots.map((snapshot) => [encodeSourceKey(snapshot.source), snapshot]),
      );
      this.snapshots = collected.map((item) => {
        if (isUsableRead(item.snapshot)) return item.snapshot;
        const previous = previousByKey.get(encodeSourceKey(item.snapshot.source));
        if (previous === undefined) return item.snapshot;
        return {
          ...previous,
          transport: item.snapshot.transport,
          sourceStatus: item.snapshot.sourceStatus,
          statusDetail: item.snapshot.statusDetail,
        };
      });
      for (const item of collected) this.status.record(item.snapshot, item.ledger);
      if (this.persist !== null) {
        await this.persist(
          collected
            .filter((item) => isUsableRead(item.snapshot))
            .map((item) =>
              projectSnapshot(item.snapshot, [], [], {
                persistJobNames: this.settings.persistJobNames,
              }),
            ),
        );
      }
      counters.sources = collected.length;
      counters.parseFailures = collected.filter(
        (item) => item.snapshot.sourceStatus === "parse-failed",
      ).length;
      counters.capExceeded = collected.filter(
        (item) => item.snapshot.sourceStatus === "cap-exceeded",
      ).length;
      counters.ledgerUnavailable = collected.filter((item) => item.ledger.status !== "read").length;
      counters.commands = collected.length * 3;
    } finally {
      counters.durationMs = Date.now() - startedAt;
      this.refreshing = false;
      this.logger.round(counters);
      this.notifyAll();
    }
  }

  /** Resolve the profile reference backing a snapshot source, for on-demand reads. */
  profileFor(key: SourceKey): ProfileRef | undefined {
    return this.selectedProfiles().find(
      (profile) => profile.alias === key.alias && profile.profileId === key.profileId,
    );
  }

  /** Encoded keys of every source currently held. */
  sourceKeys(): readonly string[] {
    return this.snapshots.map((snapshot) => encodeSourceKey(snapshot.source));
  }
}
