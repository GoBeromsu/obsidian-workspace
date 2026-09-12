import { PluginSettingTab, Setting, type App } from "obsidian";
import type { ProfileRef } from "../types/hermes-cron";
import type { TransportStatus } from "../types/remote-command";
import { encodeSourceKey } from "../types/snapshot";
import type HermesCronViewerPlugin from "../main";
import { notify } from "./notices";
import { ConnectionTargetModal } from "./connection-target-modal";
import { ProfileDocumentModal } from "./profile-document-modal";
import { discoverProfiles } from "./profile-discovery-runner";
import { renderProfileSection } from "./profile-settings-section";
import { renderServerSection } from "./server-settings-section";

/** Actionable reason per transport failure, so the user knows what to fix outside the plugin. */
const TRANSPORT_DETAIL: Record<TransportStatus, string> = {
  connected: "Connected.",
  disconnected: "Could not connect. Verify `ssh <alias>` in a terminal first.",
  "auth-failed": "Key authentication failed. Check your SSH agent and the remote authorized key.",
  "host-key-unknown": "Host key not verified. Connect once in a terminal to record it in known_hosts.",
  timeout: "Connection timed out. Check the network and the SSH alias.",
  "config-conflict-remote-command": "Remove RemoteCommand from this SSH alias and try again.",
  "config-incompatible-shell": "The remote login shell is not compatible with safe read-only commands.",
  "command-missing": "A required command is missing on the remote host. Check the Hermes installation.",
  "proxy-failed": "SSH proxy connection failed. Check ProxyJump or ProxyCommand.",
};

function note(parent: HTMLElement, text: string): void {
  parent.createEl("p", { cls: "hcv-settings-note", text });
}

/** Long-form constraints live behind a native disclosure so the tab stays short by default. */
function disclosure(parent: HTMLElement, summary: string, body: string): void {
  const block = parent.createEl("details", { cls: "hcv-settings-note" });
  block.createEl("summary", { text: summary });
  block.createEl("p", { text: body });
}

function keyOf(profile: ProfileRef): string {
  return encodeSourceKey({ alias: profile.alias, profileId: profile.profileId });
}

/** Server registration, profile selection and viewer limits. No secrets are stored here. */
export class HermesCronSettingsTab extends PluginSettingTab {
  private discovered = new Map<string, readonly ProfileRef[]>();
  private status = new Map<string, string>();
  private pending = new Set<string>();

  constructor(app: App, private readonly plugin: HermesCronViewerPlugin) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Connections").setHeading();
    note(containerEl, "Cron is read-only. Profile documents save only on request.");
    disclosure(
      containerEl,
      "SSH requirements",
      "Uses your existing ~/.ssh/config aliases with key authentication only; no password is stored. The host key must already be in known_hosts, and an alias that sets RemoteCommand cannot be used.",
    );
    renderServerSection(containerEl, {
      servers: this.plugin.settings.servers,
      statusOf: (alias) => this.status.get(alias) ?? "Connection not checked yet.",
      isBusy: (alias) => this.pending.has(alias),
      onAdd: (alias) => void this.addServer(alias),
      onEdit: (alias) => this.editTarget(alias),
      onCheck: (alias) => void this.checkConnection(alias),
      onRemove: (alias) => void this.removeServer(alias),
    });

    new Setting(containerEl).setName("Profiles").setHeading();
    this.renderProfiles(containerEl);

    new Setting(containerEl).setName("Storage").setHeading();
    this.renderStorage(containerEl);
  }

  private async addServer(alias: string): Promise<void> {
    const settings = this.plugin.settings;
    await this.plugin.saveSettings({ ...settings, servers: [...settings.servers, alias] });
    this.display();
  }

  /** Opens the target editor; nothing changes until the user presses Save inside the modal. */
  private editTarget(alias: string): void {
    if (this.pending.has(alias)) return;
    new ConnectionTargetModal(
      this.app,
      alias,
      (target) => this.plugin.replaceServerTarget(alias, target),
      () => this.forgetLocalRow(alias),
    ).open();
  }

  /** Discovery results and the status line belong to the old target only. */
  private forgetLocalRow(alias: string): void {
    this.discovered.delete(alias);
    this.status.delete(alias);
    this.display();
  }

  private async checkConnection(alias: string): Promise<void> {
    if (this.pending.has(alias)) return;
    this.pending.add(alias);
    this.status.set(alias, "Connecting...");
    this.display();
    try {
      const result = await discoverProfiles(this.plugin.adapter, alias);
      if (result.transport !== "connected") {
        this.status.set(alias, TRANSPORT_DETAIL[result.transport]);
        return;
      }
      this.discovered.set(alias, result.profiles);
      this.status.set(alias, `Connected - ${result.profiles.length} profile(s) found`);
      // rememberRemoteHome also seeds the in-memory state, so selected sources rebuild offline.
      this.plugin.rememberRemoteHome(alias, result.profiles[0]?.home.replace(/\/\.hermes$/, "") ?? "");
    } catch {
      this.status.set(alias, "Connection check failed. Verify `ssh <alias>` in a terminal first.");
    } finally {
      this.pending.delete(alias);
      this.display();
    }
  }

  private async removeServer(alias: string): Promise<void> {
    const settings = this.plugin.settings;
    const kept = settings.selectedSources.filter((key) => !key.startsWith(`${alias}\u0000`));
    this.discovered.delete(alias);
    this.status.delete(alias);
    await this.plugin.saveSettings({
      ...settings,
      servers: settings.servers.filter((candidate) => candidate !== alias),
      selectedSources: kept,
    });
    await this.plugin.forgetServer(alias);
    this.display();
  }

  private renderProfiles(parent: HTMLElement): void {
    const rendered = renderProfileSection(parent, {
      sources: {
        servers: this.plugin.settings.servers,
        known: this.knownProfiles(),
        discovered: this.discovered,
      },
      isSelected: (profile) => this.plugin.settings.selectedSources.includes(keyOf(profile)),
      onToggle: (profile, selected) => this.toggleProfile(profile, selected),
      // Opens the editor only; nothing is written until the user saves inside the modal.
      onEditDocument: (profile, name) => new ProfileDocumentModal(this.app, profile, name).open(),
    });
    if (rendered === 0) note(parent, "No profile known yet. Check a server to list its profiles.");
  }

  /** Selected sources and restored snapshots, so known profiles survive a settings reopen. */
  private knownProfiles(): readonly ProfileRef[] {
    const restored = this.plugin.state.getSnapshots().map((snapshot) => ({
      alias: snapshot.source.alias,
      profileId: snapshot.source.profileId,
      home: snapshot.home,
    }));
    return [...restored, ...this.plugin.state.selectedProfiles()];
  }

  private async toggleProfile(profile: ProfileRef, selected: boolean): Promise<void> {
    const key = keyOf(profile);
    const current = this.plugin.settings.selectedSources;
    const next = selected ? [...new Set([...current, key])] : current.filter((c) => c !== key);
    await this.plugin.saveSettings({ ...this.plugin.settings, selectedSources: next });
    if (!selected) await this.plugin.dropCachedSource(key);
    this.plugin.scheduler.trigger();
  }

  private renderStorage(parent: HTMLElement): void {
    new Setting(parent)
      .setName("Store job names on disk")
      .setDesc("Job names may echo prompt text. When off, only job ids are written to disk.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.persistJobNames).onChange(async (value) => {
          await this.plugin.saveSettings({ ...this.plugin.settings, persistJobNames: value });
        }),
      );

    new Setting(parent)
      .setName("History rows per query")
      .setDesc("Execution rows fetched per source in one round (1-200).")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.historyLimit)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) return;
          await this.plugin.saveSettings({ ...this.plugin.settings, historyLimit: parsed });
        }),
      );

    new Setting(parent)
      .setName("Cached schedule metadata")
      .setDesc("Stored in the vault config folder and may sync. Bodies are never written to disk.")
      .addExtraButton((button) =>
        button.setIcon("eraser").setTooltip("Clear cache").onClick(async () => {
          await this.plugin.clearCache();
          notify("Cached schedule metadata cleared.");
        }),
      );
  }
}
