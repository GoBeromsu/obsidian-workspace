import { Modal, type App } from "obsidian";
import type { CronJobRecord, OutputFileIndex, ProfileRef } from "../types/hermes-cron";
import type { LedgerReadResult } from "../types/snapshot";
import { buildListOutputFiles, buildReadOutputFile } from "../domain/read-command-builder";
import { buildOutputFileIndex } from "../domain/output-file-index";
import { splitNulRecords } from "../domain/response-bound";
import { readExecutionHistory } from "./execution-history-reader";
import type { HistoryCursor, JobTabId } from "../types/view";
import { renderLedgerPanel, renderOutputPanel } from "./job-evidence-panels";
import { createJobPanel, renderJobTabs, renderOverviewPanel } from "./job-detail-panels";
import { renderVerbatimBody } from "./run-output-viewer";
import type { SshReadOnlyAdapter } from "./ssh-read-only-adapter";
import type { VerbatimMemoryStore } from "./verbatim-memory-store";

const EMPTY_INDEX: OutputFileIndex = { files: [], rejectedCount: 0 };

/** Job detail: a compact header plus exactly one of the Overview / History / Output panels. */
export class JobDetailModal extends Modal {
  private ledger: LedgerReadResult = { status: "read", detail: null, rows: [], windowLimited: false };
  private outputs: OutputFileIndex = EMPTY_INDEX;
  private outputError: string | null = null;
  private selectedOutput: string | null = null;
  private bodyError: string | null = null;
  private cursor: HistoryCursor | null = null;
  private pageError: string | null = null;
  // Panel selection is instance state, so a background refresh never moves the user's tab.
  private activeTab: JobTabId = "overview";
  private focusTab = false;
  // Until the first read returns, an empty ledger/index is unknown, not "there is nothing".
  private loading = true;
  private closed = false;

  constructor(
    app: App,
    private readonly job: CronJobRecord,
    private readonly profile: ProfileRef,
    private readonly adapter: SshReadOnlyAdapter,
    private readonly bodies: VerbatimMemoryStore,
    private readonly historyLimit: number,
  ) {
    super(app);
  }

  override async onOpen(): Promise<void> {
    // Wider than the default modal so an output body is readable without wrapping every line.
    const modal = this.modalEl as HTMLElement | undefined;
    modal?.addClass("hcv-detail-modal");
    this.render();
    await this.loadEvidence();
    this.loading = false;
    this.render();
  }

  override onClose(): void {
    this.closed = true;
    this.contentEl.empty();
  }

  private async loadEvidence(): Promise<void> {
    this.ledger = await readExecutionHistory(this.adapter, this.profile, {
      jobId: this.job.id,
      limit: this.historyLimit,
    });

    const listing = buildListOutputFiles(this.profile.home, this.job.id);
    if (!listing.ok) {
      this.outputError = `${listing.code}: ${listing.detail}`;
      return;
    }
    const outcome = await this.adapter.run(this.profile.alias, listing.command);
    if (outcome.transport !== "connected" || (outcome.exitCode ?? 0) !== 0) {
      // A missing output directory is normal; anything else is reported rather than shown as empty.
      this.outputError = outcome.stderr.trim() === ""
        ? `output listing failed (${outcome.transport})`
        : outcome.stderr.trim();
      return;
    }
    this.outputError = null;
    this.outputs = buildOutputFileIndex(
      { alias: this.profile.alias, profileId: this.profile.profileId },
      this.job.id,
      `${this.profile.home}/cron/output/${this.job.id}`,
      splitNulRecords(outcome.stdout, outcome.capExceeded),
    );
  }

  private async openOutput(fileName: string): Promise<void> {
    this.selectedOutput = fileName;
    this.bodyError = null;
    const key = `${this.profile.alias}\u0000${this.profile.profileId}\u0000${this.job.id}\u0000${fileName}`;
    if (!this.bodies.has(key)) {
      const command = buildReadOutputFile(this.profile.home, this.job.id, fileName);
      if (!command.ok) {
        this.bodyError = `${command.code}: ${command.detail}`;
      } else {
        const outcome = await this.adapter.run(this.profile.alias, command.command);
        // Only a successful read is cached; a failed read must never become an empty body.
        if (outcome.transport === "connected" && (outcome.exitCode ?? 0) === 0) {
          this.bodies.set(key, outcome.stdout, outcome.capExceeded);
        } else {
          this.bodyError = outcome.stderr.trim() === ""
            ? `could not read this output file (${outcome.transport})`
            : outcome.stderr.trim();
        }
      }
    }
    this.render();
  }

  /** Fetch the next bounded page using the native ordering's keyset cursor. */
  private async loadOlder(): Promise<void> {
    const last = this.ledger.rows[this.ledger.rows.length - 1];
    if (last === undefined || last.claimedAt === null) return;
    this.cursor = { claimedAt: last.claimedAt, id: last.id };
    const page = await readExecutionHistory(this.adapter, this.profile, {
      jobId: this.job.id,
      limit: this.historyLimit,
      before: this.cursor,
    });
    if (page.status === "read") {
      this.pageError = null;
      this.ledger = { ...page, rows: [...this.ledger.rows, ...page.rows] };
    } else {
      // Keep the rows already loaded, but say plainly that the older page failed.
      this.pageError = page.detail ?? "the older history page could not be read";
    }
    this.render();
  }

  private selectTab(id: JobTabId, fromKeyboard: boolean): void {
    this.activeTab = id;
    this.focusTab = fromKeyboard;
    this.render();
  }

  private render(): void {
    // An in-flight read that finishes after the modal closed must not repaint a dead element.
    if (this.closed) return;
    const root = this.contentEl;
    root.empty();
    root.addClass("hcv-detail");

    const header = root.createDiv({ cls: "hcv-detail-header" });
    header.createEl("h2", { cls: "hcv-detail-title", text: this.job.name ?? this.job.id });
    const meta = header.createDiv({ cls: "hcv-detail-meta" });
    meta.createSpan({ cls: "hcv-detail-meta-item", text: `id ${this.job.id}` });
    meta.createSpan({
      cls: "hcv-detail-meta-item",
      text: `${this.profile.alias} / ${this.profile.profileId}`,
    });

    renderJobTabs(root, this.activeTab, (id, fromKeyboard) => this.selectTab(id, fromKeyboard), this.focusTab);
    this.focusTab = false;

    const panel = createJobPanel(root, this.activeTab);
    if (this.activeTab === "overview") {
      renderOverviewPanel(panel, this.job);
      return;
    }
    if (this.activeTab === "history") {
      if (this.loading) panel.createEl("p", { cls: "hcv-evidence-empty", text: "Loading history" });
      else {
        const more = this.ledger.windowLimited ? () => void this.loadOlder() : null;
        renderLedgerPanel(panel, this.ledger, more, this.pageError);
      }
      return;
    }
    this.renderOutput(panel);
  }

  /** Output: the native file selector, then the body of the file the user explicitly opened. */
  private renderOutput(panel: HTMLElement): void {
    panel.createEl("p", {
      cls: "hcv-evidence-note",
      text: "Hermes stores no link between a ledger row and an output file, so these are not paired.",
    });
    if (this.loading) {
      panel.createEl("p", { cls: "hcv-evidence-empty", text: "Loading output files" });
      return;
    }
    renderOutputPanel(panel, this.outputs, (name) => void this.openOutput(name), this.outputError);

    if (this.bodyError !== null) {
      panel.createEl("p", { cls: "hcv-evidence-empty", text: this.bodyError });
    }

    if (this.selectedOutput !== null) {
      const key = `${this.profile.alias}\u0000${this.profile.profileId}\u0000${this.job.id}\u0000${this.selectedOutput}`;
      renderVerbatimBody(panel, this.selectedOutput, this.bodies.get(key));
    }
  }
}
