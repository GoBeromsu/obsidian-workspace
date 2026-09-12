import { Plugin, type App, type WorkspaceLeaf } from "obsidian";
import { checkAlias } from "./domain/remote-token-validator";
import type { ObsidianSettingsAccess, TargetChangeResult } from "./types/contracts";
import { DEFAULT_SETTINGS, type ViewerSettings } from "./types/snapshot";
import { childProcessRunner } from "./ui/child-process-runner";
import { SshReadOnlyAdapter } from "./ui/ssh-read-only-adapter";
import { ViewerState } from "./ui/viewer-state";
import { TODAY_TIMELINE_VIEW, TodayTimelineView } from "./ui/today-timeline-view";
import { WEEK_CALENDAR_VIEW, WeekCalendarView } from "./ui/week-calendar-view";
import { HermesCronSettingsTab } from "./ui/settings-tab";
import { Logger } from "./utils/logger";
import { RefreshScheduler } from "./ui/refresh-scheduler";
import { SnapshotDiskStore } from "./ui/snapshot-disk-store";
import { PluginDataGateway } from "./ui/plugin-data-gateway";

interface PersistedData {
  readonly settings?: Partial<ViewerSettings>;
  readonly remoteHomes?: Record<string, string>;
}

/** Wiring only: construct collaborators, register views and commands, restore persisted data. */
export default class HermesCronViewerPlugin extends Plugin {
  override settings: ViewerSettings = DEFAULT_SETTINGS;
  adapter!: SshReadOnlyAdapter;
  state!: ViewerState;
  scheduler!: RefreshScheduler;
  private readonly logger = new Logger();
  private remoteHomes: Record<string, string> = {};
  private store!: SnapshotDiskStore;
  private data!: PluginDataGateway;

  override async onload(): Promise<void> {
    this.data = new PluginDataGateway(this);
    const data = await this.data.read<PersistedData & Record<string, unknown>>();
    this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
    this.remoteHomes = { ...(data.remoteHomes ?? {}) };

    this.adapter = new SshReadOnlyAdapter({ runner: childProcessRunner });
    this.state = new ViewerState(this.adapter, this.settings, this.logger);
    for (const [alias, home] of Object.entries(this.remoteHomes)) {
      this.state.rememberHome(alias, home);
    }

    this.store = new SnapshotDiskStore(this.data);
    this.state.setPersistSink((snapshots) => this.store.save(snapshots));
    this.state.restore(await this.store.load());

    this.scheduler = new RefreshScheduler(
      () => this.state.refresh(),
      this.settings.autoRefreshSeconds * 1000,
    );
    this.state.scheduler = this.scheduler;

    this.registerView(TODAY_TIMELINE_VIEW, (leaf) => new TodayTimelineView(leaf, this.state));
    this.registerView(WEEK_CALENDAR_VIEW, (leaf) => new WeekCalendarView(leaf, this.state));

    this.addRibbonIcon("clock", "Hermes: Today", () => {
      void this.activateView(TODAY_TIMELINE_VIEW, "right");
    });
    this.addRibbonIcon("settings", "Hermes: Settings", () => {
      this.openSettings();
    });

    this.addCommand({
      id: "open-today-timeline",
      name: "Open today timeline",
      callback: () => void this.activateView(TODAY_TIMELINE_VIEW, "right"),
    });
    this.addCommand({
      id: "open-week-calendar",
      name: "Open week calendar",
      callback: () => void this.activateView(WEEK_CALENDAR_VIEW, "tab"),
    });
    this.addCommand({
      id: "refresh-now",
      name: "Refresh now",
      callback: () => this.scheduler.trigger(),
    });
    this.addCommand({
      id: "open-settings",
      name: "Open settings",
      callback: () => this.openSettings(),
    });

    this.addSettingTab(new HermesCronSettingsTab(this.app, this));
  }

  override onunload(): void {
    this.scheduler.stop();
    this.state.bodies.clear();
    this.logger.info("unloaded");
  }

  async saveSettings(settings: ViewerSettings): Promise<void> {
    this.settings = settings;
    this.state.setSettings(settings);
    this.scheduler.setInterval(settings.autoRefreshSeconds * 1000);
    await this.persist();
  }

  /**
   * Replace one registered SSH target in place.
   *
   * A different target may be a different machine, so nothing recorded for the old target is
   * carried over: its selected sources, cached snapshots and remembered remote home are dropped
   * through their existing owners. The new target starts unverified. Unrelated servers and every
   * other setting are preserved.
   */
  async replaceServerTarget(previous: string, next: string): Promise<TargetChangeResult> {
    const target = next.trim();
    if (!checkAlias(target).ok) return { ok: false, reason: "invalid" };
    const settings = this.settings;
    if (!settings.servers.includes(previous)) return { ok: false, reason: "unknown" };
    if (target === previous) return { ok: true, changed: false };
    if (settings.servers.includes(target)) return { ok: false, reason: "duplicate" };

    await this.saveSettings({
      ...settings,
      servers: settings.servers.map((server) => (server === previous ? target : server)),
      selectedSources: settings.selectedSources.filter(
        (key) => !key.startsWith(`${previous}\u0000`),
      ),
    });
    await this.forgetServer(previous);
    // Reload the surviving projection so stale in-memory snapshots for the old target disappear.
    this.state.restore(await this.store.load());
    return { ok: true, changed: true };
  }

  rememberRemoteHome(alias: string, remoteHome: string): void {
    if (remoteHome === "") return;
    this.remoteHomes[alias] = remoteHome;
    this.state.rememberHome(alias, remoteHome);
    void this.persist();
  }

  async forgetServer(alias: string): Promise<void> {
    delete this.remoteHomes[alias];
    await this.store.removeServer(alias);
    await this.persist();
  }

  /** Deselecting a source removes its cached projection immediately. */
  async dropCachedSource(encodedKey: string): Promise<void> {
    const [alias = "", profileId = ""] = encodedKey.split("\u0000");
    await this.store.remove(alias, profileId);
  }

  async clearCache(): Promise<void> {
    await this.store.clear();
    this.state.bodies.clear();
  }

  private async persist(): Promise<void> {
    // Queued through the single data owner so a concurrent snapshot save cannot be lost.
    await this.data.update<Record<string, unknown>>((current) => ({
      ...current,
      settings: this.settings,
      remoteHomes: this.remoteHomes,
    }));
  }

  private openSettings(): void {
    const app = this.app as App & ObsidianSettingsAccess;
    app.setting.open();
    app.setting.openTabById(this.manifest.id);
  }

  private async activateView(viewType: string, placement: "right" | "tab"): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(viewType);
    const leaf: WorkspaceLeaf | null =
      existing[0] ??
      (placement === "right" ? this.app.workspace.getRightLeaf(false) : this.app.workspace.getLeaf("tab"));
    if (leaf === null) return;
    await leaf.setViewState({ type: viewType, active: true });
    this.app.workspace.revealLeaf(leaf);
    this.scheduler.trigger();
  }
}
